import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { DashboardTemplate } from "../DashboardTemplate";

function naglowek() {
  return {
    okruszki: [{ etykieta: "Pulpit" }],
    tytul: "Pulpit",
    onPowrot: () => {},
  };
}

function obszary(container: HTMLElement) {
  return Array.from(container.querySelectorAll("[data-obszar]")).map((w) => w.getAttribute("data-obszar"));
}

describe("DashboardTemplate", () => {
  it("kolejność obszarów w DOM zgodna z 06-ATOMY §5, w. 188 (wszystkie obszary obecne)", () => {
    const { container } = render(
      <DashboardTemplate
        naglowek={naglowek()}
        nastepnyKrok={<div>Wróć do lekcji</div>}
        kafle={[{ id: "k1", etykieta: "Ukończone kursy", mianownik: "kursów", wartosc: 3 }]}
        glowna={<div>Główna treść</div>}
        wspierajaca={<div>Treść wspierająca</div>}
      />,
    );
    expect(obszary(container)).toEqual(["naglowek", "nastepny-krok", "staty", "kolumny", "glowna", "wspierajaca"]);
  });

  it("bez bloku „następny krok” i bez kafli renderuje wyłącznie nagłówek i kolumny", () => {
    const { container } = render(
      <DashboardTemplate naglowek={naglowek()} glowna={<div>Główna</div>} wspierajaca={<div>Wspierająca</div>} />,
    );
    expect(obszary(container)).toEqual(["naglowek", "kolumny", "glowna", "wspierajaca"]);
  });
});
