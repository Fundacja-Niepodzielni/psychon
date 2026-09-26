import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ForbiddenState from "@/components/molecules/ForbiddenState";

describe("ForbiddenState", () => {
  it('pokazuje domyślny komunikat odmowy bez słów „błąd" ani „nie udało się" (Z-6)', () => {
    render(<ForbiddenState />);

    expect(screen.getByText("Brak dostępu")).toBeInTheDocument();
    const tresc = screen.getByText(/Nie masz uprawnień/);
    expect(tresc.textContent).not.toMatch(/błąd|nie udało się/i);
  });

  it("noga negatywna: przyjmuje własny komunikat zamiast domyślnego", () => {
    render(<ForbiddenState message="Ta lista jest dostępna tylko administracji." />);

    expect(screen.getByText("Ta lista jest dostępna tylko administracji.")).toBeInTheDocument();
    // ForbiddenState wybiera tekst komunikatu synchronicznie na podstawie
    // props message w tym samym render() wyżej — domyślny tekst nie może się
    // pojawić obok własnego.
    expect(screen.queryByText("Nie masz uprawnień do wyświetlenia tej listy.")).not.toBeInTheDocument();
  });
});
