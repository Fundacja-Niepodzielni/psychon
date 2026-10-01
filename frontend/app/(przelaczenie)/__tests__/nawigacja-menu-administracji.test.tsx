import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek nawigacji menu w nowej ramce administracji (`PowlokaAdministracji`):
 * zwykłe kliknięcie pozycji menu idzie przez `router.push` (przejście po
 * stronie klienta, bez przeładowania dokumentu), kliknięcie z Ctrl/Meta albo
 * środkowym przyciskiem zostaje przy domyślnej akcji przeglądarki, a
 * wylogowanie wychodzi pod adres SSO przez `window.location.assign` — z
 * `router.push("/logowanie")` wyłącznie w gałęzi awaryjnej. Podmienione są
 * tylko transport HTTP, router, adres strony i `window.location`.
 * `fireEvent.click` zwraca `false`, gdy domyślna akcja została zatrzymana.
 */

const push = vi.fn();
const api = vi.fn();
const endSession = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

// Powłoka bierze klienta API z beczki `@/lib/api`, a narzędzia paska — z `@/lib/api/klient`: oba moduły dostają te same atrapy.
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: vi.fn().mockResolvedValue({ data: [], meta: undefined }),
  endSession: (...args: unknown[]) => endSession(...args),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: vi.fn().mockResolvedValue({ data: [], meta: undefined }),
  endSession: (...args: unknown[]) => endSession(...args),
}));

const { PowlokaAdministracji } = await import("@/app/(przelaczenie)/admin/PowlokaAdministracji");

const ADRES_WYLOGOWANIA = "https://konta.example.org/realms/niepodzielni/protocol/openid-connect/logout?id_token_hint=xyz";

function wyrenderuj() {
  render(
    <PowlokaAdministracji>
      <p>Treść strony próbnej</p>
    </PowlokaAdministracji>,
  );
  return within(screen.getByRole("complementary", { name: "Menu i konto" }));
}

beforeEach(() => {
  push.mockReset();
  endSession.mockReset().mockResolvedValue(undefined);
  api.mockReset();
  api.mockImplementation((adres: string) => {
    if (adres === "/me") return Promise.resolve({ role: "project_manager", first_name: "Ewa", last_name: "Demo" });
    if (adres === "/admin/edition") return Promise.resolve({ starts_at: "2026-10-01", ends_at: "2027-03-31" });
    return Promise.resolve([]);
  });
});

describe("PowlokaAdministracji — kliknięcie pozycji menu", () => {
  it("zwykłe kliknięcie: router.push z adresem pozycji i zatrzymana domyślna nawigacja", () => {
    const bok = wyrenderuj();
    const lacze = bok.getByRole("link", { name: "Sprawy" });
    expect(lacze.getAttribute("href")).toBe("/admin/sprawy");

    const domyslna = fireEvent.click(lacze);

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/admin/sprawy");
    expect(domyslna).toBe(false);
  });

  it("każda pozycja menu, także z grupy zwiniętej: router.push z jej adresem, bez domyślnej nawigacji", () => {
    const bok = wyrenderuj();
    const menu = within(bok.getByRole("navigation", { name: "Menu — Administracja" }));
    const pozycje = menu.getAllByRole("link", { hidden: true });
    const adresy = pozycje.map((pozycja) => pozycja.getAttribute("href"));
    expect(adresy).toEqual(expect.arrayContaining(["/admin", "/admin/sprawy", "/admin/czas-nauki"]));

    for (const pozycja of pozycje) {
      push.mockClear();
      const domyslna = fireEvent.click(pozycja);
      expect(push.mock.calls, `pozycja ${pozycja.getAttribute("href")}`).toEqual([[pozycja.getAttribute("href")]]);
      expect(domyslna, `domyślna akcja pozycji ${pozycja.getAttribute("href")}`).toBe(false);
    }
  });

  it.each([
    ["Ctrl", { ctrlKey: true }],
    ["Meta", { metaKey: true }],
    ["środkowy przycisk", { button: 1 }],
  ])("kliknięcie z modyfikatorem (%s): bez router.push, domyślna akcja przeglądarki", (_nazwa, opcje) => {
    const bok = wyrenderuj();

    const domyslna = fireEvent.click(bok.getByRole("link", { name: "Sprawy" }), opcje);

    expect(push).not.toHaveBeenCalled();
    expect(domyslna).toBe(true);
  });
});

describe("PowlokaAdministracji — wylogowanie", () => {
  let assign: ReturnType<typeof vi.fn>;
  let prawdziwaLokalizacja: PropertyDescriptor | undefined;

  beforeEach(() => {
    assign = vi.fn();
    prawdziwaLokalizacja = Object.getOwnPropertyDescriptor(window, "location");
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign, origin: "https://platforma.example.org" },
    });
  });

  afterEach(() => {
    if (prawdziwaLokalizacja) Object.defineProperty(window, "location", prawdziwaLokalizacja);
    vi.unstubAllGlobals();
  });

  it("adres z odpowiedzi trafia do window.location.assign po zakończeniu sesji; router.push nie jest wołane", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("/api/auth/end-session-url");
      return { ok: true, json: async () => ({ url: ADRES_WYLOGOWANIA }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const bok = wyrenderuj();

    await userEvent.click(bok.getByRole("button", { name: "Wyloguj" }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith(ADRES_WYLOGOWANIA));
    expect(assign).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(endSession.mock.invocationCallOrder[0]).toBeLessThan(assign.mock.invocationCallOrder[0]);
    expect(push).not.toHaveBeenCalled();
  });

  it("gałąź awaryjna (adresu nie da się odczytać): sesja się kończy, router.push(\"/logowanie\"), bez window.location.assign", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const bok = wyrenderuj();

    await userEvent.click(bok.getByRole("button", { name: "Wyloguj" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/logowanie"));
    expect(push).toHaveBeenCalledTimes(1);
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });
});
