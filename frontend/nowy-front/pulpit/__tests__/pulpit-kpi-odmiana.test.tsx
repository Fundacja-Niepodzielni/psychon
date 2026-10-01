import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { GODZINY, KURS_UKONCZONY, KURS_W_TOKU, KURS_ZABLOKOWANY, SZCZEGOL_W_TOKU, WARUNKI } from "./atrapy";
import { mianownikOdbytychSuperwizji, mianownikUkonczonychKursow } from "../odmiana-kafli";

/**
 * Odmiana napisów pod liczbą w kaflach pulpitu uczestnika (słownik 2.1 §6):
 * według PIERWSZEJ liczby kafla — 1 ukończony · 2–4 ukończone · 5+ ukończonych,
 * 1 odbyta · 2–4 odbyte · 5+ odbytych; „0” jak 5.
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

beforeEach(() => {
  pobierzKursy.mockReset();
  pobierzSzczegolKursu.mockReset().mockResolvedValue(SZCZEGOL_W_TOKU);
  pobierzWarunkiCertyfikatu.mockReset().mockResolvedValue(WARUNKI);
  pobierzGodzinyStazu.mockReset().mockResolvedValue(GODZINY);
  pobierzNadchodzaceSuperwizje.mockReset().mockResolvedValue([]);
});

afterEach(() => cleanup());

describe("KPI uczestnika — odmiana według pierwszej liczby", () => {
  it.each([
    [0, "z 3 ukończonych"],
    [1, "z 3 ukończony"],
    [2, "z 3 ukończone"],
    [4, "z 3 ukończone"],
    [5, "z 3 ukończonych"],
    [12, "z 3 ukończonych"],
    [22, "z 3 ukończone"],
  ])("kursy: %i ukończonych", (liczba, oczekiwane) => {
    expect(mianownikUkonczonychKursow(liczba, 3)).toBe(oczekiwane);
  });

  it.each([
    [0, "z 6 odbytych"],
    [1, "z 6 odbyta"],
    [2, "z 6 odbyte"],
    [4, "z 6 odbyte"],
    [5, "z 6 odbytych"],
    [12, "z 6 odbytych"],
    [22, "z 6 odbyte"],
  ])("superwizja: %i odbytych", (liczba, oczekiwane) => {
    expect(mianownikOdbytychSuperwizji(liczba, 6)).toBe(oczekiwane);
  });

  it("superwizja bez wymaganej liczby: samo słowo według pierwszej liczby", () => {
    expect(mianownikOdbytychSuperwizji(1)).toBe("odbyta");
    expect(mianownikOdbytychSuperwizji(3)).toBe("odbyte");
    expect(mianownikOdbytychSuperwizji(undefined)).toBe("odbytych");
  });

  it("na ekranie: 1 ukończony kurs i 5 odbytych superwizji (kontrola dodatnia: 2 kursy i 1 superwizja → inne końcówki)", async () => {
    pobierzKursy.mockResolvedValue([KURS_UKONCZONY, KURS_W_TOKU, KURS_ZABLOKOWANY]);
    pobierzWarunkiCertyfikatu.mockResolvedValue({
      ...WARUNKI,
      conditions: WARUNKI.conditions.map((w) => (w.key === "supervision" ? { ...w, done: 5, required: 6 } : w)),
    });
    render(<PulpitUczestnika programUkonczony={false} />);
    await waitFor(() => expect(screen.getAllByText("z 3 ukończony").length).toBeGreaterThan(0));
    expect(screen.getAllByText("z 6 odbytych").length).toBeGreaterThan(0);
    expect(screen.queryByText("z 3 ukończone")).toBeNull();
    expect(screen.queryByText("z 6 odbyta")).toBeNull();
    cleanup();

    pobierzKursy.mockResolvedValue([KURS_UKONCZONY, { ...KURS_UKONCZONY, id: 9, slug: "drugi" }, KURS_ZABLOKOWANY]);
    pobierzWarunkiCertyfikatu.mockResolvedValue({
      ...WARUNKI,
      conditions: WARUNKI.conditions.map((w) => (w.key === "supervision" ? { ...w, done: 1, required: 6 } : w)),
    });
    render(<PulpitUczestnika programUkonczony={false} />);
    await waitFor(() => expect(screen.getAllByText("z 3 ukończone").length).toBeGreaterThan(0));
    expect(screen.getAllByText("z 6 odbyta").length).toBeGreaterThan(0);
  });
});
