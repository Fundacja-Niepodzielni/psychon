import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Ten sam znacznik zgłoszenia i ta sama chwila „teraz” dają na Sprawach i na
 * Dyżurach do decyzji ten sam tekst wieku (obie plakietki biorą go z jednej
 * funkcji `dniOczekiwania` z `sprawy/wiek.ts`, liczonej w dniach kalendarzowych
 * czasu warszawskiego). Zegar jest ustawiony na chwilę „teraz” każdej pary
 * (tylko `Date`); odczyty to atrapy funkcji dziedzinowych i transportu.
 */

const pobierzKolejkeSpraw = vi.fn();
const pobierzSprawyProwadzacych = vi.fn();
const api = vi.fn();
const apiPaged = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));
vi.mock("../../sprawy/dane", async () => {
  const rzeczywiste = await vi.importActual<typeof import("../../sprawy/dane")>("../../sprawy/dane");
  return { ...rzeczywiste, pobierzKolejkeSpraw: (...args: unknown[]) => pobierzKolejkeSpraw(...args) };
});
vi.mock("../../sprawy/dane-prowadzacych", async () => {
  const rzeczywiste = await vi.importActual<typeof import("../../sprawy/dane-prowadzacych")>(
    "../../sprawy/dane-prowadzacych",
  );
  return { ...rzeczywiste, pobierzSprawyProwadzacych: (...args: unknown[]) => pobierzSprawyProwadzacych(...args) };
});
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: (...a: unknown[]) => api(...a),
  apiPaged: (...a: unknown[]) => apiPaged(...a),
}));
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return {
    ...oryginal,
    api: (...a: unknown[]) => api(...a),
    apiPaged: (...a: unknown[]) => apiPaged(...a),
  };
});

const { Sprawy } = await import("../../sprawy/Sprawy");
const { StazKolejka } = await import("../StazKolejka");

interface Para {
  opis: string;
  czekaOd: string;
  teraz: string;
  wiek: string;
}

const PARY: Para[] = [
  { opis: "granica doby: 23:59 → 00:01 czasu warszawskiego", czekaOd: "2026-09-30T21:59:00Z", teraz: "2026-09-30T22:01:00Z", wiek: "1 dzień" },
  { opis: "00:01 → 23:59 tego samego dnia", czekaOd: "2026-09-30T22:01:00Z", teraz: "2026-10-01T21:59:00Z", wiek: "od dziś" },
  { opis: "znacznik UTC będący w Warszawie już następnym dniem", czekaOd: "2026-09-30T22:30:00Z", teraz: "2026-10-01T10:00:00Z", wiek: "od dziś" },
  { opis: "doba jesiennej zmiany czasu (25.10.2026, 25 h)", czekaOd: "2026-10-24T22:00:00Z", teraz: "2026-10-25T23:00:00Z", wiek: "1 dzień" },
  { opis: "doba wiosennej zmiany czasu (29.03.2026, 23 h)", czekaOd: "2026-03-28T23:00:00Z", teraz: "2026-03-29T22:00:00Z", wiek: "1 dzień" },
  { opis: "tydzień wstecz", czekaOd: "2026-09-24T12:00:00Z", teraz: "2026-10-01T12:00:00Z", wiek: "7 dni" },
];

function pozycjaSprawy(czekaOd: string) {
  return {
    id: "internship_entries-9",
    idLiczbowe: 9,
    rodzaj: "internship_entries",
    tytul: "Dyżur — Marta Demo",
    osoba: "Marta Demo",
    nazwisko: "Demo",
    podpowiedz: "Czeka od wczoraj",
    czekaOd,
    href: "/sprawa/internship_entries/9",
  };
}

function wpisDyzuru(czekaOd: string) {
  return {
    id: 91,
    date: "2026-08-27",
    hours: "3.5",
    form: "phone_duty",
    consultations_count: 4,
    description: null,
    status: "submitted",
    review_comment: null,
    decided_at: null,
    created_at: czekaOd,
    updated_at: czekaOd,
    user: { id: 17, first_name: "Marta", last_name: "Demo" },
  };
}

async function plakietkaSpraw(czekaOd: string): Promise<string> {
  pobierzKolejkeSpraw.mockResolvedValue([
    { rodzaj: "applications", pozycje: [], blad: null, kodBledu: null, liczbaCalkowita: 0 },
    {
      rodzaj: "internship_entries",
      pozycje: [pozycjaSprawy(czekaOd)],
      blad: null,
      kodBledu: null,
      liczbaCalkowita: 1,
    },
    { rodzaj: "profiles", pozycje: [], blad: null, kodBledu: null, liczbaCalkowita: 0 },
  ]);
  const { container } = render(<Sprawy />);
  const plakietka = await screen.findByText(/^czeka /);
  const tekst = plakietka.textContent ?? "";
  // Podtytuł ekranu mówi to samo: „Najstarsza sprawa czeka <wiek>.”.
  expect(container.textContent).toContain(`Najstarsza sprawa ${tekst}.`);
  cleanup();
  return tekst;
}

async function plakietkaDyzurow(czekaOd: string): Promise<string> {
  apiPaged.mockResolvedValueOnce({
    data: [wpisDyzuru(czekaOd)],
    meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
  });
  render(<StazKolejka />);
  const plakietka = await screen.findByText(/^czeka /);
  const tekst = plakietka.textContent ?? "";
  cleanup();
  return tekst;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  pobierzKolejkeSpraw.mockReset();
  pobierzSprawyProwadzacych.mockReset();
  pobierzSprawyProwadzacych.mockResolvedValue({ sprawy: [], blad: null, odmowa: false });
  api.mockReset();
  apiPaged.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("wiek sprawy: Sprawy i Dyżury do decyzji pokazują ten sam tekst dla tej samej pary (znacznik, teraz)", () => {
  it.each(PARY)("$opis: oba ekrany pokazują „czeka $wiek”", async ({ czekaOd, teraz, wiek }) => {
    vi.setSystemTime(new Date(teraz));
    const naSprawach = await plakietkaSpraw(czekaOd);
    const naDyzurach = await plakietkaDyzurow(czekaOd);
    expect(naSprawach).toBe(`czeka ${wiek}`);
    expect(naDyzurach).toBe(naSprawach);
  });
});
