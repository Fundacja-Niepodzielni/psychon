import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Label } from "../Label";

describe("Label", () => {
  it("łączy się z kontrolką przez htmlFor/id", () => {
    render(
      <>
        <Label htmlFor="imie" dzieci="Imię" />
        <input id="imie" />
      </>,
    );
    expect(screen.getByLabelText("Imię")).toBeInTheDocument();
  });

  // Poprzednia wersja tego testu obiecywała w tytule "oznaczona
  // aria-hidden" i mierzyła WYŁĄCZNIE obecność gwiazdki w textContent —
  // usunięcie `aria-hidden="true"` z Label.tsx nie mogło tego zaczerwienić.
  // Ciało teraz mierzy dokładnie to, co obiecuje tytuł: sam znacznik
  // gwiazdki ma `aria-hidden="true"`, a etykieta jako całość dalej niesie
  // tekst "*" (dwuznaczność wizualna bez podwójnego odczytu w czytniku
  // ekranu).
  it("gwiazdka obowiązkowości jest oznaczona aria-hidden, nie zastępuje tekstu", () => {
    render(<Label htmlFor="e" dzieci="E-mail" wymagane />);
    const etykieta = screen.getByText("E-mail", { exact: false });
    expect(etykieta.textContent).toContain("*");
    const gwiazdka = etykieta.querySelector('[aria-hidden="true"]');
    expect(gwiazdka).not.toBeNull();
    expect(gwiazdka?.textContent).toContain("*");
  });

  it("bez wymagane nie pokazuje gwiazdki", () => {
    render(<Label htmlFor="e" dzieci="E-mail" />);
    expect(screen.getByText("E-mail").textContent).toBe("E-mail");
  });
});
