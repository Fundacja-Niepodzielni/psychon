import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { KURS_STUDENTA_UKONCZONY, KURS_STUDENTA_W_TOKU } from "./atrapy";

/** Odmiana liczebnika w kaflu pulpitu studenta: „z 1 kursu”, nie „z 1 kursów” (słownik 2.1 §6). */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const pobierzKursy = vi.fn();
const pobierzSzczegolKursu = vi.fn();
vi.mock("../dane", () => ({
  pobierzKursy: (...args: unknown[]) => pobierzKursy(...args),
  pobierzSzczegolKursu: (...args: unknown[]) => pobierzSzczegolKursu(...args),
}));

const { PulpitStudenta, mianownikKursow } = await import("../PulpitStudenta");

beforeEach(() => {
  pobierzKursy.mockReset();
  pobierzSzczegolKursu.mockReset();
});

describe("Pulpit studenta — odmiana „z N kursów” (słownik 2.1 §6)", () => {
  it.each([
    [0, "z 0 kursów"],
    [1, "z 1 kursu"],
    [2, "z 2 kursów"],
    [5, "z 5 kursów"],
    [12, "z 12 kursów"],
    [22, "z 22 kursów"],
  ])("mianownik kafla dla %i", (liczba, oczekiwane) => {
    expect(mianownikKursow(liczba)).toBe(oczekiwane);
  });

  it("na ekranie: jeden kurs daje „z 1 kursu”, nie „z 1 kursów” (kontrola dodatnia: dwa kursy → „z 2 kursów”)", async () => {
    pobierzSzczegolKursu.mockResolvedValue({ ...KURS_STUDENTA_W_TOKU, instructor: null, topics: [], lessons: [], materials: [] });
    pobierzKursy.mockResolvedValue([KURS_STUDENTA_W_TOKU]);
    const jeden = render(<PulpitStudenta />);
    await waitFor(() => expect(screen.getAllByText("z 1 kursu").length).toBeGreaterThan(0));
    expect(screen.queryByText("z 1 kursów")).toBeNull();
    jeden.unmount();

    pobierzKursy.mockResolvedValue([KURS_STUDENTA_UKONCZONY, KURS_STUDENTA_W_TOKU]);
    render(<PulpitStudenta />);
    await waitFor(() => expect(screen.getAllByText("z 2 kursów").length).toBeGreaterThan(0));
  });
});
