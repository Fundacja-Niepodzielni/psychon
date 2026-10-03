import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  GODZINY,
  KURS_UKONCZONY,
  KURS_W_TOKU,
  LEKCJA_DO_ZROBIENIA,
  SZCZEGOL_W_TOKU,
  WARUNKI,
} from "./atrapy";
import { zdanieObejrzanychMinut } from "../nastepny-krok";

/**
 * Pulpit uczestnika: podpis następnego kroku bez formy rodzajowej („obejrzane 12
 * z 20 minut”) i rząd czterech liczb ułożony do wyrównania od 1180 px (struktura
 * kafla — położenia mierzy `e2e/pulpity-rowne-kafle.spec.ts`).
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const pobierzKursy = vi.fn();
const pobierzSzczegolKursu = vi.fn();
const pobierzWarunkiCertyfikatu = vi.fn();
const pobierzGodzinyStazu = vi.fn();
const pobierzNadchodzaceSuperwizje = vi.fn();

vi.mock("../dane", () => ({
  pobierzKursy: (...args: unknown[]) => pobierzKursy(...args),
  pobierzSzczegolKursu: (...args: unknown[]) => pobierzSzczegolKursu(...args),
  pobierzWarunkiCertyfikatu: (...args: unknown[]) => pobierzWarunkiCertyfikatu(...args),
  pobierzGodzinyStazu: (...args: unknown[]) => pobierzGodzinyStazu(...args),
  pobierzNadchodzaceSuperwizje: (...args: unknown[]) => pobierzNadchodzaceSuperwizje(...args),
}));

const { PulpitUczestnika } = await import("../PulpitUczestnika");

/** Formy czasownika w czasie przeszłym z końcówką rodzajową („zatrzymałaś”, „obejrzałeś”) i słowo „zatrzymał…”. */
const FORMA_RODZAJOWA = /\p{L}+(łaś|łeś)(?!\p{L})|zatrzymał/iu;

beforeEach(() => {
  pobierzKursy.mockReset().mockResolvedValue([KURS_UKONCZONY, KURS_W_TOKU]);
  pobierzSzczegolKursu.mockReset().mockResolvedValue(SZCZEGOL_W_TOKU);
  pobierzWarunkiCertyfikatu.mockReset().mockResolvedValue(WARUNKI);
  pobierzGodzinyStazu.mockReset().mockResolvedValue(GODZINY);
  pobierzNadchodzaceSuperwizje.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
});

function szczegolZLekcja(nadpisania: Record<string, unknown>) {
  return {
    ...SZCZEGOL_W_TOKU,
    lessons: SZCZEGOL_W_TOKU.lessons.map((lekcja) =>
      lekcja.id === LEKCJA_DO_ZROBIENIA.id ? { ...lekcja, ...nadpisania } : lekcja,
    ),
  };
}

describe("PulpitUczestnika — podpis następnego kroku", () => {
  it("lekcja z nagraniem w trakcie: „obejrzane 12 z 20 minut”, bez żadnej formy rodzajowej na ekranie", async () => {
    pobierzSzczegolKursu.mockResolvedValue(szczegolZLekcja({ active_seconds: 720, duration_seconds: 1200 }));
    const { container } = render(<PulpitUczestnika programUkonczony={false} />);

    await waitFor(() => expect(screen.getByText(/obejrzane 12 z 20 minut/)).toBeInTheDocument());
    const karta = container.querySelector('[data-karta="nastepny-krok"]') as HTMLElement;
    expect(karta.textContent).toContain("Kurs „Wywiad psychologiczny” · obejrzane 12 z 20 minut.");
    expect(container.querySelector("main")?.textContent ?? "").not.toMatch(FORMA_RODZAJOWA);
  });

  it("kontrola dodatnia: bez czasu oglądania podpis to sam kurs, bez zdania o minutach", async () => {
    pobierzSzczegolKursu.mockResolvedValue(szczegolZLekcja({ active_seconds: 0 }));
    const { container } = render(<PulpitUczestnika programUkonczony={false} />);

    await waitFor(() => expect(screen.getByText("Kurs „Wywiad psychologiczny”.")).toBeInTheDocument());
    expect(container.textContent).not.toContain("obejrzane");
  });

  it("zdanieObejrzanychMinut: pełne minuty, nie więcej niż czas lekcji; bez nagrania, bez czasu i bez pełnej minuty — null", () => {
    const lekcja = { ...LEKCJA_DO_ZROBIENIA, duration_seconds: 1200, active_seconds: 720 };
    expect(zdanieObejrzanychMinut(lekcja)).toBe("obejrzane 12 z 20 minut");
    expect(zdanieObejrzanychMinut({ ...lekcja, active_seconds: 779 })).toBe("obejrzane 12 z 20 minut");
    expect(zdanieObejrzanychMinut({ ...lekcja, active_seconds: 5000 })).toBe("obejrzane 20 z 20 minut");
    expect(zdanieObejrzanychMinut({ ...lekcja, duration_seconds: 60, active_seconds: 60 })).toBe("obejrzane 1 z 1 minuty");
    expect(zdanieObejrzanychMinut({ ...lekcja, active_seconds: 59 })).toBeNull();
    expect(zdanieObejrzanychMinut({ ...lekcja, active_seconds: 0 })).toBeNull();
    expect(zdanieObejrzanychMinut({ ...lekcja, duration_seconds: 0 })).toBeNull();
    expect(zdanieObejrzanychMinut({ ...lekcja, has_recording: false })).toBeNull();
    const bezCzasu = { ...lekcja, duration_seconds: undefined };
    expect(zdanieObejrzanychMinut(bezCzasu)).toBeNull();
  });
});

describe("PulpitUczestnika — rząd czterech liczb do wyrównania", () => {
  it("rząd ma znacznik wyrównania, cztery kafle, a każdy kafel najwyżej trzy dzieci; wyróżnienie pierwszej liczby zostaje", async () => {
    const { container } = render(<PulpitUczestnika programUkonczony={false} />);
    await waitFor(() => expect(container.querySelector('[data-obszar="staty"] [role="list"]')).not.toBeNull());

    const rzad = container.querySelector('[data-obszar="staty"] [role="list"]') as HTMLElement;
    expect(rzad).toHaveAttribute("data-wyrownane");
    const kafle = [...rzad.querySelectorAll<HTMLElement>("[data-wyrownany]")];
    expect(kafle).toHaveLength(4);
    for (const kafel of kafle) {
      expect(kafel.children.length, kafel.outerHTML).toBeLessThanOrEqual(3);
    }
    expect(kafle.map((kafel) => kafel.hasAttribute("data-dominujacy"))).toEqual([true, false, false, false]);
  });

  it("kafel „Bieżący kurs” (pasek i nazwa kursu) ma pasek i nazwę w jednym bloku pod liczbą", async () => {
    const { container } = render(<PulpitUczestnika programUkonczony={false} />);
    await waitFor(() => expect(container.querySelector("#pulpit-biezacy-etap")).not.toBeNull());

    const kafel = (container.querySelector("#pulpit-biezacy-etap") as HTMLElement).parentElement as HTMLElement;
    expect(kafel.children).toHaveLength(3);
    const blok = kafel.children[2] as HTMLElement;
    expect(blok.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(blok.textContent).toContain("Wywiad psychologiczny");
  });
});
