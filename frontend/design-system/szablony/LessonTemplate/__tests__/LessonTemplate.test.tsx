import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { LessonTemplate } from "../LessonTemplate";

function naglowek() {
  return {
    okruszki: [{ etykieta: "Kurs" }, { etykieta: "Lekcja" }],
    tytul: "Wprowadzenie do wywiadu",
    onPowrot: () => {},
  };
}

function obszary(container: HTMLElement) {
  return Array.from(container.querySelectorAll("[data-obszar]")).map((w) => w.getAttribute("data-obszar"));
}

describe("LessonTemplate", () => {
  it("kolejność obszarów w DOM zgodna z 06-ATOMY §5, w. 186 (wszystkie obszary obecne)", () => {
    const { container } = render(
      <LessonTemplate
        naglowek={naglowek()}
        checklist={{
          tytul: "Braki",
          braki: [{ id: "b1", tekst: "Uzupełnij treść", href: "#a" }],
          gotowe: [],
          onZamknij: () => {},
        }}
        pasekKrokow={<div>Krok 2 z 7</div>}
        glowna={<div>Odtwarzacz i treść</div>}
        wspierajaca={<div>Materiały i pytania</div>}
      />,
    );
    expect(obszary(container)).toEqual(["naglowek", "checklist", "pasek-krokow", "kolumny", "glowna", "wspierajaca"]);
  });

  it("bez checklisty i bez paska kroków renderuje wyłącznie nagłówek i kolumny", () => {
    const { container } = render(
      <LessonTemplate naglowek={naglowek()} glowna={<div>Główna</div>} wspierajaca={<div>Wspierająca</div>} />,
    );
    expect(obszary(container)).toEqual(["naglowek", "kolumny", "glowna", "wspierajaca"]);
  });

  it("korzeń układu niesie znacznik data-style-id=szablon-lekcja", () => {
    const { container } = render(
      <LessonTemplate naglowek={naglowek()} glowna={<div>Główna</div>} wspierajaca={<div>Wspierająca</div>} />,
    );
    const uklad = container.querySelector("[data-style-id='szablon-lekcja']") as HTMLElement;
    expect(uklad).toBeTruthy();
    expect(uklad).toBe(container.firstElementChild);
  });
});
