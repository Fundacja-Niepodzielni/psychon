import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Render okna pomocy: przycisk w spoczynku, formularz po otwarciu — pole
 * tresci obowiazkowe, ograniczone do 2000 znakow, bez pola ekranu do
 * wypelnienia przez uzytkownika (ekran pochodzi z biezacej sciezki, patrz
 * `components/layout/HelpWidget.tsx`).
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/panel/start",
}));

const HelpWidget = (await import("@/components/layout/HelpWidget")).default;

describe("HelpWidget — render", () => {
  it("w spoczynku pokazuje wyłącznie przycisk, bez otwartego formularza", () => {
    render(<HelpWidget />);

    expect(screen.getByRole("button", { name: "Pomoc" })).toBeInTheDocument();
    // HelpWidget otwiera formularz wyłącznie przez lokalny useState
    // inicjalizowany na "zamknięte" — render() wyżej ustawia ten stan
    // synchronicznie, bez efektu, który mógłby otworzyć dialog później.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("po kliknięciu pokazuje formularz z obowiązkowym polem treści (do 2000 znaków)", async () => {
    const user = userEvent.setup();
    render(<HelpWidget />);

    await user.click(screen.getByRole("button", { name: "Pomoc" }));

    const pole = screen.getByLabelText("Opisz, w czym możemy pomóc");
    expect(pole).toBeRequired();
    expect(pole).toHaveAttribute("maxlength", "2000");
    // Ekran nadawcy nie jest polem formularza — nie ma go do wypelnienia.
    expect(screen.queryByLabelText(/ekran/i)).not.toBeInTheDocument();
  });
});
