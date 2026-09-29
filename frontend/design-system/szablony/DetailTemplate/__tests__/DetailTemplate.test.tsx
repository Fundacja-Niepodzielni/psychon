import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { DetailTemplate } from "../DetailTemplate";
import { jedenMain } from "../../__tests__/jeden-main";
import { Skeleton } from "../../../atomy/Skeleton/Skeleton";
import { Notice } from "../../../molekuly/Notice/Notice";
import { EmptyState } from "../../../molekuly/EmptyState/EmptyState";

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

  it("korzeń układu niesie znacznik data-style-id=szablon-szczegol", () => {
    const { container } = render(
      <DetailTemplate naglowek={naglowek()} glowna={<div>Główna</div>} wspierajaca={<div>Wspierająca</div>} />,
    );
    const uklad = container.querySelector("[data-style-id='szablon-szczegol']") as HTMLElement;
    expect(uklad).toBeTruthy();
    expect(uklad).toBe(container.firstElementChild);
  });
});

describe("DetailTemplate — świadek jedenMain, pięć stanów obszaru treści", () => {
  it("stan sukces: korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <DetailTemplate naglowek={naglowek()} glowna={<div>Zwykła treść szczegółu.</div>} wspierajaca={<div>Wspierająca</div>} />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-szczegol");
  });

  it("stan ladowanie (Skeleton): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <DetailTemplate naglowek={naglowek()} glowna={<Skeleton wiersze={3} />} wspierajaca={<div>Wspierająca</div>} />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-szczegol");
  });

  it("stan blad (Notice): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <DetailTemplate
        naglowek={naglowek()}
        glowna={
          <Notice wariant="error" tytul="Błąd">
            Nie udało się pobrać szczegółu.
          </Notice>
        }
        wspierajaca={<div>Wspierająca</div>}
      />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-szczegol");
  });

  it("stan brak uprawnien (Notice): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <DetailTemplate
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
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-szczegol");
  });

  it("stan pusty (EmptyState): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <DetailTemplate
        naglowek={naglowek()}
        glowna={
          <EmptyState
            naglowek="Brak szczegółów"
            tresc="Nie ma jeszcze żadnych szczegółów."
            przycisk={{ etykieta: "Odśwież", onClick: () => {} }}
          />
        }
        wspierajaca={<div>Wspierająca</div>}
      />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-szczegol");
  });
});
