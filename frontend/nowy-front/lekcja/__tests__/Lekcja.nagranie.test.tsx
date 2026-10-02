import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { KURS, LEKCJA, ramkaOdtwarzacza, zrodloRamki } from "./pomoce";

/**
 * Ekran odróżnia nagranie w przygotowaniu, nagranie, które nie działa, i lekcję
 * bez nagrania. Zdania dla osoby nie zawierają słów technicznych ani wzmianki o
 * dostawcy; treść i materiały lekcji zostają we wszystkich trzech.
 */

const pobierzDaneLekcji = vi.fn();
const pobierzOdczytKursu = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../dane", async (importOriginal) => {
  const original = await importOriginal<typeof import("../dane")>();
  return { ...original, pobierzDaneLekcji: (...args: unknown[]) => pobierzDaneLekcji(...args), pobierzPytania: async () => [] };
});

vi.mock("../kurs", async (importOriginal) => {
  const original = await importOriginal<typeof import("../kurs")>();
  return { ...original, pobierzOdczytKursu: (...args: unknown[]) => pobierzOdczytKursu(...args) };
});

const { Lekcja } = await import("../Lekcja");

const SLOWA_TECHNICZNE = /błąd|dostawc|przetwarza|wysyła|serwer|video|status|503/i;

beforeEach(() => {
  pobierzDaneLekcji.mockReset();
  pobierzOdczytKursu.mockReset();
  pobierzOdczytKursu.mockResolvedValue(KURS);
});

async function otworz(wynik: unknown) {
  pobierzDaneLekcji.mockResolvedValue(wynik);
  const rezultat = render(<Lekcja id="21" />);
  await screen.findByRole("heading", { level: 1, name: LEKCJA.title });
  await screen.findByText(/lekcji ukończone/);
  return rezultat;
}

function blokNagrania(kontener: HTMLElement) {
  return kontener.querySelector('section[aria-labelledby="naglowek-nagrania"]') as HTMLElement;
}

describe("nagranie w przygotowaniu", () => {
  it("zdanie bez słów technicznych, bez ramki odtwarzacza; opis, treść i pliki zostają", async () => {
    const { container } = await otworz({ status: "ok", dane: LEKCJA, bezNagrania: true, nagranie: "w-przygotowaniu" });

    expect(blokNagrania(container).textContent).not.toMatch(SLOWA_TECHNICZNE);
    expect(ramkaOdtwarzacza()).toBeNull();
    expect(screen.getByText("Opis lekcji")).toBeInTheDocument();
    expect(screen.getByText(/Kryzys psychiczny nie zawsze wygląda jak kryzys\./)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Materiały do pobrania" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Napisz do prowadzącego" })).toBeNull();
  });

  it("lekcja bez opisu i treści: zdanie o przygotowaniu zamiast stanu pustego o braku nagrania", async () => {
    await otworz({
      status: "ok",
      dane: { ...LEKCJA, description: null, content: null },
      bezNagrania: true,
      nagranie: "w-przygotowaniu",
    });

    expect(screen.getByText("Nagranie jest w przygotowaniu.")).toBeInTheDocument();
    expect(screen.queryByText("Ta lekcja nie ma jeszcze nagrania ani treści.")).toBeNull();
  });
});

describe("nagranie, które nie działa", () => {
  it("zdanie bez słów technicznych, „Napisz do prowadzącego”, nigdy „brak nagrania”", async () => {
    const { container } = await otworz({ status: "ok", dane: LEKCJA, bezNagrania: true, nagranie: "nie-dziala" });

    expect(blokNagrania(container).textContent).not.toMatch(SLOWA_TECHNICZNE);
    expect(screen.getByRole("button", { name: "Napisz do prowadzącego" })).toBeInTheDocument();
    expect(screen.queryByText("Ta lekcja nie ma jeszcze nagrania ani treści.")).toBeNull();
    expect(screen.queryByText("Nagranie jest w przygotowaniu.")).toBeNull();
    expect(screen.getByText(/Kryzys psychiczny nie zawsze wygląda jak kryzys\./)).toBeInTheDocument();
  });
});

describe("gotowe nagranie i brak nagrania", () => {
  it("nagranie gotowe: odtwarzacz, bez zdań o przygotowaniu i błędzie", async () => {
    await otworz({ status: "ok", dane: LEKCJA, bezNagrania: false, zrodloNagrania: zrodloRamki() });

    expect(ramkaOdtwarzacza()).not.toBeNull();
    expect(screen.queryByText("Nagranie jest w przygotowaniu.")).toBeNull();
    expect(screen.queryByText("Tego nagrania nie da się teraz obejrzeć.")).toBeNull();
  });

  it("lekcja bez nagrania: bez sekcji nagrania i bez zdań o nagraniu; treść zostaje", async () => {
    const { container } = await otworz({ status: "ok", dane: { ...LEKCJA, video_status: "none" }, bezNagrania: true });

    expect(blokNagrania(container)).toBeNull();
    expect(screen.queryByText("Nagranie jest w przygotowaniu.")).toBeNull();
    expect(screen.getByText("Opis lekcji")).toBeInTheDocument();
  });

  it("lekcja bez nagrania, opisu, treści i plików: stan pusty", async () => {
    pobierzOdczytKursu.mockResolvedValue({ ...KURS, materials: [] });
    await otworz({ status: "ok", dane: { ...LEKCJA, description: null, content: null }, bezNagrania: true });

    expect(screen.getByText("Ta lekcja nie ma jeszcze nagrania ani treści.")).toBeInTheDocument();
  });
});
