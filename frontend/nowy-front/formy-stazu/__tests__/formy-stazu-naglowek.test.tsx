import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Słownik form stażu: „Dodaj formę” jest jedynym kolorowym przyciskiem ekranu i stoi
 * w nagłówku (`PageHeader`), nie w treści; opis i plakietki zgodne ze słownikiem
 * (bez kodu pakietu, plakietka małą literą).
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

function kolorowe(korzen: ParentNode) {
  return Array.from(korzen.querySelectorAll("button")).filter((b) =>
    b.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

beforeEach(() => {
  pobierzFormyStazu.mockReset().mockResolvedValue(FORMY);
});

describe("FormyStazu — nagłówek i słownik", () => {
  it("„Dodaj formę” jest w nagłówku, jedyny w kolorze; po otwarciu panelu znika z nagłówka", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = render(<FormyStazu />);
    await waitFor(() => expect(screen.getByText("Dyżur telefoniczny")).toBeInTheDocument());

    const naglowek = container.querySelector("header")!;
    const wszystkie = kolorowe(container);
    expect(wszystkie).toHaveLength(1);
    expect(naglowek).toContainElement(wszystkie[0]);
    expect(wszystkie[0]).toHaveTextContent("Dodaj formę");

    await uzytkownik.click(wszystkie[0]);
    expect(screen.getByRole("heading", { level: 2, name: "Nowa forma" })).toBeInTheDocument();
    expect(kolorowe(naglowek)).toHaveLength(0);
    // Jedyny kolorowy przycisk panelu to „Zapisz”.
    expect(kolorowe(container)).toHaveLength(1);
  });

  it("opis bez kodu pakietu, plakietki małą literą", async () => {
    const { container } = render(<FormyStazu />);
    await waitFor(() => expect(screen.getByText("Dyżur telefoniczny")).toBeInTheDocument());
    expect(container.textContent).not.toMatch(/\(H11\)|H11/);
    expect(screen.getByText("aktywna")).toBeInTheDocument();
    expect(screen.getByText("nieaktywna")).toBeInTheDocument();
  });
});
