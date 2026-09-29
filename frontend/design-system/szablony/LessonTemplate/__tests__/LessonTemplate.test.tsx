import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { LessonTemplate } from "../LessonTemplate";
import { jedenMain } from "../../__tests__/jeden-main";
import { Skeleton } from "../../../atomy/Skeleton/Skeleton";
import { Notice } from "../../../molekuly/Notice/Notice";
import { EmptyState } from "../../../molekuly/EmptyState/EmptyState";

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

describe("LessonTemplate — świadek jedenMain, pięć stanów obszaru treści", () => {
  it("stan sukces: korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <LessonTemplate naglowek={naglowek()} glowna={<div>Zwykła treść lekcji.</div>} wspierajaca={<div>Wspierająca</div>} />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-lekcja");
  });

  it("stan ladowanie (Skeleton): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <LessonTemplate naglowek={naglowek()} glowna={<Skeleton wiersze={3} />} wspierajaca={<div>Wspierająca</div>} />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-lekcja");
  });

  it("stan blad (Notice): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <LessonTemplate
        naglowek={naglowek()}
        glowna={
          <Notice wariant="error" tytul="Błąd">
            Nie udało się pobrać lekcji.
          </Notice>
        }
        wspierajaca={<div>Wspierająca</div>}
      />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-lekcja");
  });

  it("stan brak uprawnien (Notice): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <LessonTemplate
        naglowek={naglowek()}
        glowna={
          <Notice wariant="warn" tytul="Brak uprawnień">
            Ten widok wymaga innej roli.
          </Notice>
        }
        wspierajaca={<div>Wspierająca</div>}
      />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-lekcja");
  });

  it("stan pusty (EmptyState): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <LessonTemplate
        naglowek={naglowek()}
        glowna={
          <EmptyState
            naglowek="Brak treści lekcji"
            tresc="Ta lekcja nie ma jeszcze żadnej treści."
            przycisk={{ etykieta: "Odśwież", onClick: () => {} }}
          />
        }
        wspierajaca={<div>Wspierająca</div>}
      />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-lekcja");
  });
});
