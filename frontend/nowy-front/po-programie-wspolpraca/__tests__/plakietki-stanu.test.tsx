import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Brzmienie stanu zgłoszenia w historii osoby po programie: plakietka pisana
 * małą literą, bez słów zakazanych słownika i bez surowych kodów stanu
 * jako tekstu.
 */

const pobierzJa = vi.fn();
const pobierzMojeZgloszenia = vi.fn();
const zglosWspolprace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api/h01-wspolpraca", () => ({
  pobierzJa: (...args: unknown[]) => pobierzJa(...args),
  pobierzMojeZgloszenia: (...args: unknown[]) => pobierzMojeZgloszenia(...args),
  zglosWspolprace: (...args: unknown[]) => zglosWspolprace(...args),
}));

const { PoProgramieWspolpraca } = await import("../PoProgramieWspolpraca");

function zgloszenie(id: number, status: "new" | "answered" | "closed") {
  return {
    id,
    body: `Treść zgłoszenia numer ${id}.`,
    status,
    response: status === "new" ? null : "Dziękujemy za zgłoszenie.",
    responded_at: status === "new" ? null : "2026-09-21T10:00:00Z",
    created_at: "2026-09-20T10:00:00Z",
    updated_at: "2026-09-20T10:00:00Z",
  };
}

const ZAKAZANE_SLOWA = [/\bNew\b/, /\bOpen\b/, /\bAnswered\b/, /\bClosed\b/, /Otwarte/, /Rozwiązane/, /Obsłużone/];
const SUROWE_KODY = /\b(new|answered|closed)\b/;

beforeEach(() => {
  pobierzJa.mockReset();
  pobierzMojeZgloszenia.mockReset();
  zglosWspolprace.mockReset();
});

describe("PoProgramieWspolpraca — plakietki stanu małą literą", () => {
  it("historia: „nowe”, „z odpowiedzią”, „zamknięte”; zero słów zakazanych i surowych kodów", async () => {
    pobierzJa.mockResolvedValue({ program_completed_at: "2026-09-01T00:00:00Z", role: "volunteer" });
    pobierzMojeZgloszenia.mockResolvedValue({
      data: [zgloszenie(1, "new"), zgloszenie(2, "answered"), zgloszenie(3, "closed")],
      meta: { current_page: 1, per_page: 25, total: 3, last_page: 1 },
    });

    render(<PoProgramieWspolpraca />);
    await waitFor(() => expect(screen.getByText("Treść zgłoszenia numer 1.")).toBeInTheDocument());

    expect(screen.getAllByText("nowe")).toHaveLength(1);
    expect(screen.getAllByText("z odpowiedzią")).toHaveLength(1);
    expect(screen.getAllByText("zamknięte")).toHaveLength(1);

    const tekst = document.body.textContent ?? "";
    for (const zakazane of ZAKAZANE_SLOWA) expect(tekst).not.toMatch(zakazane);
    expect(tekst).not.toMatch(SUROWE_KODY);
  });
});
