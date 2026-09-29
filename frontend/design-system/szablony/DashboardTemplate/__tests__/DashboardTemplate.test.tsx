import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { DashboardTemplate } from "../DashboardTemplate";
import { jedenMain } from "../../__tests__/jeden-main";
import { Skeleton } from "../../../atomy/Skeleton/Skeleton";
import { Notice } from "../../../molekuly/Notice/Notice";
import { EmptyState } from "../../../molekuly/EmptyState/EmptyState";

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

  it("korzeń układu niesie znacznik data-style-id=szablon-pulpit", () => {
    const { container } = render(
      <DashboardTemplate naglowek={naglowek()} glowna={<div>Główna</div>} wspierajaca={<div>Wspierająca</div>} />,
    );
    const uklad = container.querySelector("[data-style-id='szablon-pulpit']") as HTMLElement;
    expect(uklad).toBeTruthy();
    expect(uklad).toBe(container.firstElementChild);
  });
});

describe("DashboardTemplate — świadek jedenMain, pięć stanów obszaru treści", () => {
  it("stan sukces: korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <DashboardTemplate naglowek={naglowek()} glowna={<div>Zwykła treść pulpitu.</div>} wspierajaca={<div>Wspierająca</div>} />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-pulpit");
  });

  it("stan ladowanie (Skeleton): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <DashboardTemplate naglowek={naglowek()} glowna={<Skeleton wiersze={3} />} wspierajaca={<div>Wspierająca</div>} />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-pulpit");
  });

  it("stan blad (Notice): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <DashboardTemplate
        naglowek={naglowek()}
        glowna={
          <Notice wariant="error" tytul="Błąd">
            Nie udało się pobrać pulpitu.
          </Notice>
        }
        wspierajaca={<div>Wspierająca</div>}
      />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-pulpit");
  });

  it("stan brak uprawnien (Notice): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <DashboardTemplate
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
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-pulpit");
  });

  it("stan pusty (EmptyState): korzeń jest jedynym main z id=tresc i niesie data-style-id", () => {
    const { container } = render(
      <DashboardTemplate
        naglowek={naglowek()}
        glowna={
          <EmptyState
            naglowek="Brak danych pulpitu"
            tresc="Nie ma jeszcze żadnych danych do pokazania."
            przycisk={{ etykieta: "Odśwież", onClick: () => {} }}
          />
        }
        wspierajaca={<div>Wspierająca</div>}
      />,
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-pulpit");
  });
});
