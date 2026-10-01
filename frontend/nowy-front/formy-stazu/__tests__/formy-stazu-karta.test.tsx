import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

/**
 * Słownik form stażu: lista stoi w białej karcie z nagłówkiem h2 (bez przeskoku
 * stopnia pod h1), a każdy wiersz ma akcję „Edytuj”.
 */

const pobierzFormyStazu = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../dane", () => ({ pobierzFormyStazu: (...args: unknown[]) => pobierzFormyStazu(...args) }));
vi.mock("@/lib/api/h11-formy", () => ({ utworzFormeStazu: vi.fn(), zaktualizujFormeStazu: vi.fn() }));

const { FormyStazu } = await import("../FormyStazu");

const FORMY = [
  { id: 1, name: "Dyżur telefoniczny", description: "Rozmowa.", is_active: true, sort_order: 1, created_at: null, updated_at: null },
  { id: 2, name: "Inna", description: null, is_active: false, sort_order: 2, created_at: null, updated_at: null },
];

beforeEach(() => {
  pobierzFormyStazu.mockReset().mockResolvedValue(FORMY);
});

describe("FormyStazu — lista w karcie", () => {
  it("lista form jest w obszarze karty, z nagłówkiem h2 „Formy stażu” (kontrola dodatnia: nie ma h3 o tym tytule)", async () => {
    const { container } = render(<FormyStazu />);
    await waitFor(() => expect(screen.getByText("Dyżur telefoniczny")).toBeInTheDocument());

    const karta = container.querySelector<HTMLElement>('[data-obszar="lista-form"]');
    expect(karta).not.toBeNull();
    expect(within(karta!).getByRole("heading", { level: 2, name: "Formy stażu" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: "Formy stażu" })).toBeNull();
    expect(within(karta!).getAllByRole("button", { name: "Edytuj" })).toHaveLength(2);
  });

  it("pusty słownik: stan pusty też stoi w karcie z h2", async () => {
    pobierzFormyStazu.mockResolvedValue([]);
    const { container } = render(<FormyStazu />);
    await waitFor(() => expect(screen.getByText("Brak form stażu")).toBeInTheDocument());
    const karta = container.querySelector<HTMLElement>('[data-obszar="lista-form"]');
    expect(within(karta!).getByRole("heading", { level: 2, name: "Formy stażu" })).toBeInTheDocument();
  });
});
