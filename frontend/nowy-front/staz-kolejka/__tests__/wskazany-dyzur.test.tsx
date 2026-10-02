import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { odbierzZapowiedzFokusu, zapowiedzFokusSprawy } from "../../wspolne/fokus-otwartej-sprawy";

/**
 * Wejście na „Dyżury do decyzji” z „Otwórz” na ekranie „Sprawy do decyzji”:
 * adres niesie `?dyzur=ID`, a po wczytaniu listy ten dyżur jest otwarty i
 * jego panel ma fokus. Dyżur spoza wczytanej strony niczego nie otwiera —
 * przy zapowiedzi fokus staje na nagłówku ekranu, bez niej zostaje na stronie.
 * Żaden odczyt nie zapisuje: atrapa przyjmuje wyłącznie odczyty panelu.
 */

const api = vi.fn();
const apiPaged = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: (...a: unknown[]) => api(...a),
  apiPaged: (...a: unknown[]) => apiPaged(...a),
}));
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, api: (...a: unknown[]) => api(...a), apiPaged: (...a: unknown[]) => apiPaged(...a) };
});

const { StazKolejka, dyzurZAdresu } = await import("../StazKolejka");

function wpis(id: number, imie: string) {
  return {
    id,
    date: "2026-08-27",
    hours: "3.5",
    form: "phone_duty",
    consultations_count: 4,
    description: "Dyżur telefoniczny — bez danych osób.",
    status: "submitted",
    review_comment: null,
    decided_at: null,
    created_at: "2026-09-20T10:00:00Z",
    updated_at: "2026-09-20T10:00:00Z",
    user: { id: id + 100, first_name: imie, last_name: "Demo" },
  };
}

const WPISY = [wpis(91, "Marta"), wpis(92, "Filip")];

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  apiPaged.mockResolvedValue({ data: WPISY, meta: { current_page: 1, per_page: 25, total: 2, last_page: 1 } });
  api.mockImplementation((sciezka: string, opcje?: { method?: string }) => {
    if (opcje?.method) return Promise.reject(new Error(`Nieoczekiwany zapis ${opcje.method} ${sciezka}`));
    if (sciezka.startsWith("/admin/users/")) return Promise.resolve({ progress: { hours_accepted: "18" } });
    if (sciezka === "/admin/edition") return Promise.resolve({ internship_hours_required: 72 });
    return Promise.reject(new Error(`Nieoczekiwane wywołanie ${sciezka}`));
  });
});

afterEach(() => {
  odbierzZapowiedzFokusu();
  window.history.pushState({}, "", "/");
});

function zapisy() {
  return [...api.mock.calls, ...apiPaged.mock.calls].filter(([, opcje]) => (opcje as { method?: string })?.method);
}

describe("dyzurZAdresu", () => {
  it.each([
    ["?dyzur=5", 5],
    ["?dyzur=120&inne=1", 120],
    ["", null],
    ["?dyzur=", null],
    ["?dyzur=0", null],
    ["?dyzur=-3", null],
    ["?dyzur=1.5", null],
    ["?dyzur=abc", null],
    ["?dyzur=99999999999999999999", null],
  ])("%s → %s", (zapytanie, oczekiwane) => {
    expect(dyzurZAdresu(zapytanie)).toBe(oczekiwane);
  });
});

describe("StazKolejka — dyżur wskazany w adresie", () => {
  it("po „Otwórz” ze Spraw: wskazany dyżur jest otwarty, a fokus stoi na jego panelu", async () => {
    zapowiedzFokusSprawy("/admin/staz?dyzur=92");
    window.history.pushState({}, "", "/admin/staz?dyzur=92");
    render(<StazKolejka />);

    const panel = await screen.findByRole("region", { name: "Dyżur: Filip Demo" });
    await waitFor(() => expect(panel).toHaveFocus());
    expect(screen.queryByRole("region", { name: "Dyżur: Marta Demo" })).toBeNull();
    expect(zapisy()).toHaveLength(0);
  });

  it("wskazany dyżur spoza wczytanej strony: nic nie jest otwarte, fokus na nagłówku ekranu", async () => {
    zapowiedzFokusSprawy("/admin/staz?dyzur=999");
    window.history.pushState({}, "", "/admin/staz?dyzur=999");
    render(<StazKolejka />);

    const naglowek = await screen.findByRole("heading", { level: 1, name: "Dyżury do decyzji" });
    await screen.findByText("Marta Demo");
    await waitFor(() => expect(naglowek).toHaveFocus());
    expect(naglowek).toHaveAttribute("tabindex", "-1");
    expect(screen.queryByRole("region", { name: /^Dyżur: / })).toBeNull();
  });

  it("wejście bez „Otwórz” i bez parametru: nic nie jest otwarte, fokus zostaje na stronie", async () => {
    window.history.pushState({}, "", "/admin/staz");
    render(<StazKolejka />);

    await screen.findByText("Marta Demo");
    // Po wczytaniu listy efekty już przeszły; fokus nie został przeniesiony.
    await waitFor(() => expect(apiPaged).toHaveBeenCalled());
    expect(document.activeElement).toBe(document.body);
    expect(screen.queryByRole("region", { name: /^Dyżur: / })).toBeNull();
  });
});
