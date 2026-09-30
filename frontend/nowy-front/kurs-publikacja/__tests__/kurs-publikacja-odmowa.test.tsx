import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KursPublikacja } from "../KursPublikacja";

/**
 * Odmowa z powodu roli na ekranie publikacji kursu: nazwa roli, nagłówek
 * ekranu, przycisk wyjścia i brak przycisku „Opublikuj kurs”.
 */

const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  back.mockReset();
});

describe("KursPublikacja — odmowa z powodu roli", () => {
  it("brak-uprawnien: nazwa roli, nagłówek ekranu, wyjście, bez przycisku publikacji", async () => {
    const uzytkownik = userEvent.setup();
    render(<KursPublikacja idKursu="4" wynik={{ status: "brak-uprawnien" }} />);

    expect(screen.getByText(/tylko dla prowadzących/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Publikacja kursu dla prowadzących" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Opublikuj kurs" })).toBeNull();

    await uzytkownik.click(screen.getByRole("button", { name: "Wróć" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("kontrola dodatnia: stan blad nie pokazuje odmowy", () => {
    render(<KursPublikacja idKursu="4" wynik={{ status: "blad" }} />);

    expect(screen.queryByText(/tylko dla prowadzących/)).toBeNull();
  });
});
