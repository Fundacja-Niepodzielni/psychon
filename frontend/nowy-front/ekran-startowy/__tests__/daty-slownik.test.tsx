import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/** Data ostatniej zmiany: data z godziną wg słownika, bez znacznika ISO w DOM. */

const api = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/api/klient", async (oryginal) => ({
  ...(await oryginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

const { EkranStartowy } = await import("../EkranStartowy");

const EKRAN = {
  video: { title: "Wprowadzenie do programu", url: null, caption: "Krótki film powitalny pojawi się tutaj wkrótce." },
  program: { title: "Jak wygląda program", body: "Pierwszy akapit." },
  expectations: { title: "Czego od Ciebie oczekujemy", body: "Regularnej pracy z materiałami." },
  updated_at: "2026-09-25T15:05:00Z",
};

beforeEach(() => {
  api.mockReset().mockResolvedValue(EKRAN);
});

describe("EkranStartowy — daty wg słownika", () => {
  it("ostatnia zmiana: dzień bez zera, miesiąc słownie, rok, godzina 24 h; zero znacznika ISO", async () => {
    const { container } = render(<EkranStartowy />);
    await screen.findByRole("heading", { level: 2, name: "Treść ekranu" });

    expect(screen.getByText("Ostatnia zmiana: 25 września 2026, 17:05.")).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
