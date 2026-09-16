import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek wylogowania w `PanelShell` — ten sam wzorzec co `/konto`
 * (`app/konto/page.tsx`): adres wylogowania Kont Niepodzielni czytany PRZED
 * zakończeniem sesji aplikacji, a nie stara trasa Sanctum drzwi hasłem,
 * których PsychON już nie ma.
 */

const push = vi.fn();
const endSession = vi.fn();
const apiPaged = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/panel/start",
  useRouter: () => ({ push, replace: push, refresh: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    endSession: (...args: unknown[]) => endSession(...args),
    // PanelShell renderuje `NotificationBell`, który sam odpytuje listę
    // powiadomień — atrapa, żeby test mierzył wyłącznie wylogowanie.
    apiPaged: (...args: unknown[]) => apiPaged(...args),
  };
});

const PanelShell = (await import("@/components/layout/PanelShell")).default;

const ADRES_WYLOGOWANIA =
  "https://konta.example.org/realms/niepodzielni/protocol/openid-connect/logout?id_token_hint=xyz";

let assign: ReturnType<typeof vi.fn>;
let prawdziwaLokalizacja: PropertyDescriptor | undefined;

beforeEach(() => {
  push.mockReset();
  endSession.mockReset().mockResolvedValue(undefined);
  apiPaged.mockReset().mockResolvedValue({ data: [], meta: undefined });

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

function renderShell() {
  return render(
    <PanelShell panelName="Panel testowy" menu={[]}>
      <p>treść</p>
    </PanelShell>,
  );
}

describe("PanelShell — wylogowanie przez end-session-url", () => {
  it("czyta adres wylogowania Kont, kończy sesję lokalną, potem wychodzi pod ten adres", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("/api/auth/end-session-url");
      return { ok: true, json: async () => ({ url: ADRES_WYLOGOWANIA }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    renderShell();
    await userEvent.click(screen.getByRole("button", { name: /wyloguj się/i }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith(ADRES_WYLOGOWANIA));
    expect(endSession).toHaveBeenCalledTimes(1);
    // `fetchMock` powyżej już sprawdza, że jedyny adres, pod jaki poszło
    // żądanie, to `/api/auth/end-session-url` — inny adres wywaliłby test
    // przez `expect(url).toBe(...)` w środku atrapy.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gdy adresu nie da się odczytać: sesja i tak się kończy, powrót na /logowanie", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    renderShell();
    await userEvent.click(screen.getByRole("button", { name: /wyloguj się/i }));

    await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith("/logowanie");
    expect(assign).not.toHaveBeenCalled();
  });
});
