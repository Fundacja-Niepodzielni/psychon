import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { DetailTemplate } from "../DetailTemplate";

function naglowek() {
  return {
    okruszki: [{ etykieta: "Start" }, { etykieta: "Szczegół" }],
    tytul: "Szczegół sprawy",
    onPowrot: () => {},
  };
}

function obszary(container: HTMLElement) {
  return Array.from(container.querySelectorAll("[data-obszar]")).map((w) => w.getAttribute("data-obszar"));
}

describe("DetailTemplate", () => {
  it("kolejność obszarów w DOM zgodna z 06-ATOMY §5, w. 184 (wszystkie obszary obecne)", () => {
    const { container } = render(
      <DetailTemplate
        naglowek={naglowek()}
        checklist={{
          tytul: "Braki",
          braki: [{ id: "b1", tekst: "Uzupełnij opis", href: "#a" }],
          gotowe: [],
          onZamknij: () => {},
        }}
        kafle={[{ id: "k1", etykieta: "Godziny", mianownik: "godz.", wartosc: 5 }]}
        glowna={<div>Główna treść</div>}
        wspierajaca={<div>Treść wspierająca</div>}
      />,
    );
    expect(obszary(container)).toEqual(["naglowek", "checklist", "staty", "kolumny", "glowna", "wspierajaca"]);
  });

  it("bez checklisty i bez kafli renderuje wyłącznie nagłówek i kolumny", () => {
    const { container } = render(
      <DetailTemplate naglowek={naglowek()} glowna={<div>Główna</div>} wspierajaca={<div>Wspierająca</div>} />,
    );
    expect(obszary(container)).toEqual(["naglowek", "kolumny", "glowna", "wspierajaca"]);
  });

  it("nie ma własnego elementu interaktywnego — treść slotów jest w całości z zewnątrz", () => {
    const { container } = render(
      <DetailTemplate naglowek={naglowek()} glowna={<div>Główna</div>} wspierajaca={<div>Wspierająca</div>} />,
    );
    // Jedyne przyciski/odnośniki pochodzą z PageHeader (organizm, nie szablon).
    expect(container.querySelectorAll("[data-testid='pageheader-powrot']")).toHaveLength(1);
  });
});
