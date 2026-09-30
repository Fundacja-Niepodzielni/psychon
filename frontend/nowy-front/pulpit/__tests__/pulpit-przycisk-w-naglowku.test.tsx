import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import {
  GODZINY,
  KURS_STUDENTA_UKONCZONY,
  KURS_STUDENTA_W_TOKU,
  KURS_UKONCZONY,
  KURS_W_TOKU,
  LEKCJA_DO_ZROBIENIA,
  LEKCJA_UKONCZONA,
  SZCZEGOL_W_TOKU,
  WARUNKI,
} from "./atrapy";
import { liczPrzyciskiGlowne } from "./kontrole-ekranu";

/**
 * Makieta 2.0.4 (`.head .acts`): przycisk „następnego kroku” stoi w nagłówku
 * strony, przy tytule, a blok w treści niesie tylko opis. Pulpit uczestnika i
 * pulpit studenta: jeden kolorowy przycisk, w `pageheader-glowa`, ani jednego
 * w obszarze „następny krok”; główna lista sekcji ma `h2` (pod `h1`, bez
 * przeskoku stopnia). Kontrola dodatnia: obszar „następny krok” bez przycisku
 * nadal ma swój opis (test nie przechodzi przez pusty ekran).
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const pobierzKursy = vi.fn();
const pobierzSzczegolKursu = vi.fn();
vi.mock("../dane", () => ({
  pobierzKursy: (...args: unknown[]) => pobierzKursy(...args),
  pobierzSzczegolKursu: (...args: unknown[]) => pobierzSzczegolKursu(...args),
  pobierzWarunkiCertyfikatu: vi.fn(async () => WARUNKI),
  pobierzGodzinyStazu: vi.fn(async () => GODZINY),
  pobierzNadchodzaceSuperwizje: vi.fn(async () => []),
}));

const { PulpitUczestnika } = await import("../PulpitUczestnika");
const { PulpitStudenta } = await import("../PulpitStudenta");

function przyciskiWNaglowku(container: HTMLElement): HTMLButtonElement[] {
  const glowa = container.querySelector("[data-testid='pageheader-glowa']");
  return glowa ? Array.from(glowa.querySelectorAll("button")) : [];
}

beforeEach(() => {
  pobierzKursy.mockReset();
  pobierzSzczegolKursu.mockReset();
});

describe("Pulpit uczestnika — przycisk kroku w nagłówku", () => {
  it("„Wróć do lekcji” stoi w nagłówku, obszar kroku nie ma przycisku, lista ścieżki ma h2", async () => {
    pobierzKursy.mockResolvedValue([KURS_UKONCZONY, KURS_W_TOKU]);
    pobierzSzczegolKursu.mockResolvedValue(SZCZEGOL_W_TOKU);
    const { container } = render(<PulpitUczestnika programUkonczony={false} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Wróć do lekcji" })).toBeInTheDocument());
    expect(przyciskiWNaglowku(container).map((b) => b.textContent)).toEqual(["Wróć do lekcji"]);
    expect(liczPrzyciskiGlowne(container)).toBe(1);
    const krok = container.querySelector("[data-obszar='nastepny-krok']")!;
    expect(krok.querySelectorAll("button")).toHaveLength(0);
    expect(krok).toHaveTextContent(/Struktura wywiadu/);
    expect(screen.getByRole("heading", { level: 2, name: "Twoja ścieżka" })).toBeInTheDocument();
  });

  it("ładowanie: bez przycisku w nagłówku (kontrola dodatnia: po danych przycisk jest)", async () => {
    let rozwiaz: (wartosc: unknown) => void = () => {};
    pobierzKursy.mockReturnValue(new Promise((resolve) => (rozwiaz = resolve)));
    pobierzSzczegolKursu.mockResolvedValue(SZCZEGOL_W_TOKU);
    const { container } = render(<PulpitUczestnika programUkonczony={false} />);
    expect(przyciskiWNaglowku(container)).toHaveLength(0);

    rozwiaz([KURS_W_TOKU]);
    await waitFor(() => expect(przyciskiWNaglowku(container)).toHaveLength(1));
  });
});

describe("Pulpit studenta — przycisk wznowienia w nagłówku", () => {
  it("„Wznów lekcję” stoi w nagłówku, obszar wznowienia nie ma przycisku, lista kursów ma h2", async () => {
    pobierzKursy.mockResolvedValue([KURS_STUDENTA_UKONCZONY, KURS_STUDENTA_W_TOKU]);
    pobierzSzczegolKursu.mockResolvedValue({
      ...KURS_STUDENTA_W_TOKU,
      instructor: null,
      topics: [],
      lessons: [LEKCJA_UKONCZONA, LEKCJA_DO_ZROBIENIA],
      materials: [],
    });
    const { container } = render(<PulpitStudenta />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Wznów lekcję" })).toBeInTheDocument());
    expect(przyciskiWNaglowku(container).map((b) => b.textContent)).toEqual(["Wznów lekcję"]);
    expect(liczPrzyciskiGlowne(container)).toBe(1);
    const krok = container.querySelector("[data-obszar='nastepny-krok']")!;
    expect(krok.querySelectorAll("button")).toHaveLength(0);
    expect(krok).toHaveTextContent(/Struktura wywiadu/);
    expect(screen.getByRole("heading", { level: 2, name: "Twoje kursy" })).toBeInTheDocument();
  });
});
