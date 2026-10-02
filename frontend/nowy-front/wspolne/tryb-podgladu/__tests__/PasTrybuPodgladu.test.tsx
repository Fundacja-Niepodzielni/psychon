import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ETYKIETA_POWROTU_Z_PODGLADU, PasTrybuPodgladu, TEKST_PASA_PODGLADU } from "../PasTrybuPodgladu";

describe("PasTrybuPodgladu", () => {
  it("niesie dosłowny tekst i odnośnik „Wróć do edycji kursu” pod podanym adresem", () => {
    const { container } = render(<PasTrybuPodgladu powrot="/admin/kursy/12" />);
    const region = screen.getByRole("region", { name: "Tryb podglądu" });
    expect(region.textContent?.replace(/\s+/g, " ").startsWith(TEKST_PASA_PODGLADU)).toBe(true);
    expect(TEKST_PASA_PODGLADU).toBe("Tryb podglądu. Widzisz kurs tak, jak uczestnik. Nic się nie zapisuje.");
    const odnosnik = screen.getByRole("link", { name: "Wróć do edycji kursu" });
    expect(ETYKIETA_POWROTU_Z_PODGLADU).toBe("Wróć do edycji kursu");
    expect(odnosnik.getAttribute("href")).toBe("/admin/kursy/12");
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(container.querySelectorAll("button, input")).toHaveLength(0);
  });

  it("kontrola dodatnia: inny adres powrotu zmienia odnośnik", () => {
    render(<PasTrybuPodgladu powrot="/prowadzacy/kursy/7" />);
    expect(screen.getByRole("link", { name: "Wróć do edycji kursu" }).getAttribute("href")).toBe("/prowadzacy/kursy/7");
  });

  it("nie wprowadza nagłówka do dokumentu ekranu", () => {
    const { container } = render(<PasTrybuPodgladu powrot="/admin/kursy/1" />);
    expect(container.querySelectorAll("h1, h2, h3, h4, h5, h6")).toHaveLength(0);
  });
});
