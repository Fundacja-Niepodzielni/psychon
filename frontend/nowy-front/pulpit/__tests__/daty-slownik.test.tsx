import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { GODZINY, KURS_W_TOKU, SZCZEGOL_W_TOKU, TERMIN_SUPERWIZJI, WARUNKI } from "./atrapy";

/** Termin superwizji na pulpicie uczestnika: data z godziną wg słownika, bez znacznika ISO w DOM. */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const pobierzKursy = vi.fn();
const pobierzNadchodzaceSuperwizje = vi.fn();

vi.mock("../dane", () => ({
  pobierzKursy: (...args: unknown[]) => pobierzKursy(...args),
  pobierzSzczegolKursu: vi.fn(async () => SZCZEGOL_W_TOKU),
  pobierzWarunkiCertyfikatu: vi.fn(async () => WARUNKI),
  pobierzGodzinyStazu: vi.fn(async () => GODZINY),
  pobierzNadchodzaceSuperwizje: (...args: unknown[]) => pobierzNadchodzaceSuperwizje(...args),
}));

const { PulpitUczestnika } = await import("../PulpitUczestnika");

beforeEach(() => {
  pobierzKursy.mockReset().mockResolvedValue([KURS_W_TOKU]);
  pobierzNadchodzaceSuperwizje.mockReset();
});

describe("PulpitUczestnika — daty wg słownika", () => {
  it("termin superwizji: dzień, miesiąc słownie, rok i godzina 24 h w strefie Warszawy", async () => {
    const start = new Date(Date.now() + 10 * 86_400_000);
    start.setUTCHours(15, 5, 0, 0);
    const termin = { ...TERMIN_SUPERWIZJI, starts_at: start.toISOString() };
    pobierzNadchodzaceSuperwizje.mockResolvedValue([termin]);

    const { container } = render(<PulpitUczestnika programUkonczony={false} />);
    await waitFor(() => expect(screen.getByText("Sala 1")).toBeInTheDocument());

    const tekst = container.textContent ?? "";
    expect(tekst).toMatch(/\d{1,2} [a-ząćęłńóśźż]+ \d{4}, 1[67]:05/);
    expect(tekst).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
