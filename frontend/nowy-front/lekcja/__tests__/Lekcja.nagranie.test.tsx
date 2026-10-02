import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Lekcja uczestnika odróżnia nagranie w przygotowaniu od braku nagrania i od
 * błędu odczytu nagrania. Zdanie dla osoby nie zawiera słów technicznych ani
 * wzmianki o błędzie dostawcy.
 */

const pobierzDaneLekcji = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../dane", async (importOriginal) => {
  const original = await importOriginal<typeof import("../dane")>();
  return { ...original, pobierzDaneLekcji: (...args: unknown[]) => pobierzDaneLekcji(...args) };
});

const { Lekcja } = await import("../Lekcja");

const LEKCJA = {
  id: 21,
  title: "Wprowadzenie do wywiadu",
  description: "Opis lekcji",
  content: "Pierwszy akapit treści.",
  topic: null,
  duration_seconds: 1800,
  position_seconds: 0,
  watched_seconds: 0,
  active_seconds: 0,
  is_completed: false,
  completable: false,
  completable_at_percent: 60,
};

const ZDANIE = "Nagranie w przygotowaniu.";
const SLOWA_TECHNICZNE = /błąd|dostawc|przetwarza|wysyła|serwer|video|status/i;

beforeEach(() => {
  pobierzDaneLekcji.mockReset();
});

async function otworz(wynik: unknown) {
  pobierzDaneLekcji.mockResolvedValue(wynik);
  render(<Lekcja id="21" />);
  await screen.findByRole("heading", { level: 1, name: LEKCJA.title });
}

describe("nagranie w przygotowaniu", () => {
  it("jedno zdanie bez słów technicznych, bez ramki odtwarzacza; opis i treść lekcji zostają", async () => {
    await otworz({ status: "ok", dane: LEKCJA, bezNagrania: true, nagranie: "w-przygotowaniu" });
    const zdanie = screen.getByText(ZDANIE);
    expect(zdanie).toBeInTheDocument();
    expect(zdanie.textContent).not.toMatch(SLOWA_TECHNICZNE);
    expect(screen.queryByRole("button", { name: "Odtwórz" })).toBeNull();
    expect(screen.getByText(LEKCJA.description)).toBeInTheDocument();
    expect(screen.getByText("Pierwszy akapit treści.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("lekcja bez opisu i treści: zdanie zamiast stanu pustego o braku nagrania", async () => {
    await otworz({
      status: "ok",
      dane: { ...LEKCJA, description: null, content: null },
      bezNagrania: true,
      nagranie: "w-przygotowaniu",
    });
    expect(screen.getByText(ZDANIE)).toBeInTheDocument();
    expect(screen.queryByText("Ta lekcja nie ma jeszcze nagrania ani treści.")).toBeNull();
    expect(screen.queryByText("Lekcja bez treści")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: LEKCJA.title })).toBeInTheDocument();
  });
});

describe("gotowe nagranie i brak nagrania — jak dotąd", () => {
  it("nagranie gotowe: odtwarzacz, bez zdania o przygotowaniu", async () => {
    await otworz({ status: "ok", dane: LEKCJA, bezNagrania: false });
    expect(screen.getByRole("button", { name: "Odtwórz" })).toBeInTheDocument();
    expect(screen.queryByText(ZDANIE)).toBeNull();
  });

  it("lekcja bez nagrania: bez odtwarzacza i bez zdania o przygotowaniu", async () => {
    await otworz({ status: "ok", dane: LEKCJA, bezNagrania: true });
    expect(screen.queryByRole("button", { name: "Odtwórz" })).toBeNull();
    expect(screen.queryByText(ZDANIE)).toBeNull();
    expect(screen.getByText(LEKCJA.description)).toBeInTheDocument();
  });

  it("lekcja bez nagrania, opisu i treści: stan pusty jak dotąd", async () => {
    await otworz({ status: "ok", dane: { ...LEKCJA, description: null, content: null }, bezNagrania: true });
    expect(screen.getByText("Ta lekcja nie ma jeszcze nagrania ani treści.")).toBeInTheDocument();
    expect(screen.queryByText(ZDANIE)).toBeNull();
  });
});

describe("błąd odczytu nagrania", () => {
  it("komunikat błędu z ponowieniem, a nie cichy brak nagrania; treść lekcji zostaje", async () => {
    await otworz({ status: "ok", dane: LEKCJA, bezNagrania: true, nagranie: "blad" });
    const komunikat = screen.getByRole("alert");
    expect(komunikat).toHaveTextContent("Nie udało się wczytać nagrania");
    expect(komunikat).toHaveTextContent("Sprawdź połączenie i spróbuj ponownie. Pozostała część lekcji jest dostępna poniżej.");
    expect(screen.queryByText(ZDANIE)).toBeNull();
    expect(screen.getByText("Pierwszy akapit treści.")).toBeInTheDocument();

    pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: LEKCJA, bezNagrania: false });
    await userEvent.setup().click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(await screen.findByRole("button", { name: "Odtwórz" })).toBeInTheDocument();
    expect(pobierzDaneLekcji).toHaveBeenCalledTimes(2);
  });
});
