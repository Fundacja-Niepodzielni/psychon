import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Ekran startowy: zapytania HTTP dotychczasowej strony (`StaraTresc`) i nowego
 * ekranu — odczyt `GET /onboarding` i zapis `PATCH /admin/onboarding`. Prawdziwy
 * klient API, podmieniony tylko `fetch`. Odczyt jest identyczny. Zapis różni się
 * zmierzonym zakresem ciała: dotychczasowa strona wysyła zawsze wszystkie trzy
 * sekcje, nowy ekran tylko sekcję, w której coś zmieniono (serwer przyjmuje
 * obie postaci: `sometimes` na sekcji, `required_with` na jej polach).
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/ekran-startowy",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const { default: StaraTresc } = await import("../StaraTresc");
const { EkranStartowy } = await import("@/nowy-front/ekran-startowy/EkranStartowy");

interface Zapytanie {
  metoda: string;
  adres: string;
  cialo: unknown;
}

const API = "http://localhost:8000/api/v1";
const EKRAN = {
  video: { title: "Film powitalny", url: "https://example.test/film", caption: "Podpis" },
  program: { title: "Przebieg programu", body: "Treść o programie." },
  expectations: { title: "Oczekiwania", body: "Treść o oczekiwaniach." },
  updated_at: "2026-09-20T10:15:00Z",
};

let zapytania: Zapytanie[] = [];

function atrapaFetch(wejscie: RequestInfo | URL, opcje?: RequestInit): Promise<Response> {
  const adres = String(wejscie);
  if (adres.includes("/api/auth/session")) {
    return Promise.resolve(
      new Response(JSON.stringify({ accessToken: "atrapa-tokenu", expiresAt: Date.now() + 3_600_000 }), { status: 200 }),
    );
  }
  const cialo = typeof opcje?.body === "string" ? JSON.parse(opcje.body) : null;
  zapytania.push({ metoda: opcje?.method ?? "GET", adres, cialo });
  const dane = opcje?.method === "PATCH" ? { ...EKRAN, ...cialo } : EKRAN;
  return Promise.resolve(
    new Response(JSON.stringify({ data: dane }), { status: 200, headers: { "Content-Type": "application/json" } }),
  );
}

beforeEach(() => {
  zapytania = [];
  vi.stubGlobal("fetch", vi.fn(atrapaFetch));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function otworz(wersja: "stara" | "nowa") {
  await act(async () => {
    render(wersja === "stara" ? <StaraTresc /> : <EkranStartowy />);
  });
  await screen.findByDisplayValue("Film powitalny");
}

/**
 * Limit czasu przypadków, które pod obciążeniem hosta (równoległe procesy, zimny pierwszy import)
 * trwają wielokrotnie dłużej niż domyślne 5000 ms. Wartość to większa z: trzykrotność maksimum
 * z 10 pomiarów na cichym hoście albo 15 000 ms; przy każdym przypadku stoi jego zmierzony czas.
 */
const LIMIT_PRZYPADKU_MS = 15_000;

describe("ekran startowy — zapytania dotychczasowej strony i nowego ekranu", () => {
  it("odczyt: dokładnie jedno GET /onboarding w obu wersjach", async () => {
    await otworz("stara");
    const stara = [...zapytania];
    cleanup();
    zapytania = [];
    await otworz("nowa");

    expect(zapytania).toEqual(stara);
    expect(stara).toEqual([{ metoda: "GET", adres: `${API}/onboarding`, cialo: null }]);
  });

  // zmierzone na cichym hoście: maks. 0,9 s z 10; limit 3× i co najmniej 15 s
  it("zapis zmienionego tytułu filmu: ta sama trasa i ta sama zmiana; różnica zmierzona w zakresie ciała", { timeout: LIMIT_PRZYPADKU_MS }, async () => {
    const uzytkownik = userEvent.setup();
    await otworz("stara");
    const poleStara = screen.getByLabelText("Tytuł");
    await uzytkownik.clear(poleStara);
    await uzytkownik.type(poleStara, "Zmieniony tytuł");
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz treść" }));
    await waitFor(() => expect(zapytania.some((z) => z.metoda === "PATCH")).toBe(true));
    const stara = zapytania.find((z) => z.metoda === "PATCH");
    cleanup();
    zapytania = [];

    await otworz("nowa");
    const poleNowa = screen.getByLabelText(/^Tytuł filmu powitalnego/);
    await uzytkownik.clear(poleNowa);
    await uzytkownik.type(poleNowa, "Zmieniony tytuł");
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz i opublikuj" }));
    await waitFor(() => expect(zapytania.some((z) => z.metoda === "PATCH")).toBe(true));
    const nowa = zapytania.find((z) => z.metoda === "PATCH");

    expect(nowa?.adres).toBe(stara?.adres);
    expect(nowa?.adres).toBe(`${API}/admin/onboarding`);
    const video = { title: "Zmieniony tytuł", url: "https://example.test/film", caption: "Podpis" };
    expect(stara?.cialo).toEqual({
      video,
      program: EKRAN.program,
      expectations: EKRAN.expectations,
    });
    expect(nowa?.cialo).toEqual({ video });
  });

  it("różnica zmierzona: zapis bez zmian — dotychczasowa strona wysyła PATCH, nowy ekran nie wysyła nic", async () => {
    const uzytkownik = userEvent.setup();
    await otworz("stara");
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz treść" }));
    await waitFor(() => expect(zapytania.some((z) => z.metoda === "PATCH")).toBe(true));
    cleanup();
    zapytania = [];

    await otworz("nowa");
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz i opublikuj" }));
    await screen.findByText("Nie ma zmian do opublikowania.");
    expect(zapytania.filter((z) => z.metoda === "PATCH")).toEqual([]);
  });

  it("data ostatniej zmiany w nowym ekranie jest sformatowana po polsku, nie surowym znacznikiem ISO", async () => {
    await otworz("nowa");
    const tekst = document.body.textContent ?? "";
    expect(tekst).not.toMatch(/2026-09-20/);
    expect(tekst).not.toMatch(/T\d\d:\d\d:\d\d/);
    expect(tekst).toContain("20 września 2026");
  });
});
