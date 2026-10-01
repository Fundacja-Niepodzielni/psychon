import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import {
  GODZINY,
  KURS_STUDENTA_UKONCZONY,
  KURS_STUDENTA_W_TOKU,
  KURS_UKONCZONY,
  KURS_W_TOKU,
  KURS_ZABLOKOWANY,
  SZCZEGOL_W_TOKU,
  WARUNKI,
} from "./atrapy";

/**
 * Stan kursu na ścieżce uczestnika (słownik 2.1 §2): plakietka małą literą
 * ukończony · w toku · zamknięty; kurs zamknięty ma nieaktywny przycisk
 * „Zamknięty” z kłódką (aria-disabled, nie link), kurs ukończony i w toku —
 * „Otwórz”; nigdy „Otwórz” przy kursie zamkniętym.
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

const KURS_STUDENTA_ZAMKNIETY = { ...KURS_STUDENTA_W_TOKU, id: 99, slug: "zamkniety", title: "Kurs zamknięty", status: "locked" as const, progress_percent: 0 };

beforeEach(() => {
  pobierzKursy.mockReset();
  pobierzSzczegolKursu.mockReset().mockResolvedValue(SZCZEGOL_W_TOKU);
});
afterEach(() => cleanup());

function wiersz(container: HTMLElement, stan: string) {
  const w = container.querySelector<HTMLElement>(`[data-kurs-stan="${stan}"]`);
  expect(w, `wiersz ${stan}`).not.toBeNull();
  return w!;
}

describe("kurs zamknięty na liście kursów", () => {
  it.each([
    ["uczestnik", () => <PulpitUczestnika programUkonczony={false} />, [KURS_UKONCZONY, KURS_W_TOKU, KURS_ZABLOKOWANY]],
    ["student", () => <PulpitStudenta />, [KURS_STUDENTA_UKONCZONY, KURS_STUDENTA_W_TOKU, KURS_STUDENTA_ZAMKNIETY]],
  ] as const)("%s: zamknięty = plakietka, nieaktywny „Zamknięty” z kłódką, bez „Otwórz”", async (_nazwa, ekran, kursy) => {
    pobierzKursy.mockResolvedValue(kursy);
    const { container } = render(ekran());
    await waitFor(() => expect(container.querySelector('[data-kurs-stan="locked"]')).not.toBeNull());

    const zamkniety = wiersz(container, "locked");
    expect(within(zamkniety).getByText("zamknięty")).toBeInTheDocument();
    const przycisk = within(zamkniety).getByRole("button", { name: "Zamknięty" });
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(przycisk.querySelector("svg")).not.toBeNull();
    expect(zamkniety.querySelector("a")).toBeNull();
    expect(zamkniety.querySelector("[href]")).toBeNull();
    expect(within(zamkniety).queryByText(/Otwórz/)).toBeNull();
    expect(zamkniety.textContent).not.toMatch(/zablokowany/i);
  });

  it.each([
    ["uczestnik", () => <PulpitUczestnika programUkonczony={false} />, [KURS_UKONCZONY, KURS_W_TOKU, KURS_ZABLOKOWANY], "completed", "ukończony"],
    ["uczestnik", () => <PulpitUczestnika programUkonczony={false} />, [KURS_UKONCZONY, KURS_W_TOKU, KURS_ZABLOKOWANY], "in_progress", "w toku"],
    ["student", () => <PulpitStudenta />, [KURS_STUDENTA_UKONCZONY, KURS_STUDENTA_W_TOKU, KURS_STUDENTA_ZAMKNIETY], "in_progress", "w toku"],
  ] as const)("%s: kurs %s ma odnośnik „Otwórz” (nazwa dla czytnika zaczyna się od widocznego słowa)", async (_n, ekran, kursy, stan, plakietka) => {
    pobierzKursy.mockResolvedValue(kursy);
    const { container } = render(ekran());
    await waitFor(() => expect(container.querySelector(`[data-kurs-stan="${stan}"]`)).not.toBeNull());
    const w = wiersz(container, stan);
    expect(within(w).getByText(plakietka)).toBeInTheDocument();
    const odnosnik = w.querySelector("a")!;
    expect(odnosnik).not.toBeNull();
    expect(odnosnik.getAttribute("href")).toMatch(/^\/panel\/kursy\//);
    expect(odnosnik.textContent?.trim().startsWith("Otwórz")).toBe(true);
    expect(odnosnik.getAttribute("aria-label")).toMatch(/^Otwórz/);
    expect(w.querySelector('button[aria-disabled="true"]')).toBeNull();
  });
});
