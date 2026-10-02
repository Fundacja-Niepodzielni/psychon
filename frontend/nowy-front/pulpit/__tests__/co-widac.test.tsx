import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  alerty,
  jestGlowny,
  naglowki,
  przeskokiNaglowkow,
  rolaElementu,
  spisInteraktywnych,
  sprawdzJedenH1,
  sprawdzSpis,
} from "./co-widac";

/**
 * Kontrole spisu ekranu rzucają, więc każda ma tu kontrolę dodatnią: sztuczne
 * drzewo, które ją łamie, musi ją zaczerwienić, a drzewo zgodne — przepuścić.
 */

afterEach(cleanup);

function drzewo() {
  return render(
    <div>
      <h1>Tytuł</h1>
      <button type="button">Wstecz</button>
      <a href="/a">Otwórz kurs: Pierwszy</a>
      <button type="button" className="x_primary_1" aria-describedby="powod">
        Zapisz
      </button>
      <p id="powod">Najpierw uzupełnij pole.</p>
      <button type="button" aria-disabled="true">
        Zamknięty
      </button>
      <button type="button" disabled>
        Wyłączony
      </button>
      <label>
        Imię
        <input type="text" />
      </label>
      <div hidden>
        <button type="button">Ukryty</button>
      </div>
      <div aria-hidden="true">
        <a href="/b">Przed czytnikiem</a>
      </div>
      <div tabIndex={-1}>poza kolejnością</div>
    </div>,
  ).container;
}

const ZGODNY = [
  { rola: "button", nazwa: "Wstecz" },
  { rola: "link", nazwa: "Otwórz kurs: Pierwszy", href: "/a" },
  { rola: "button", nazwa: "Zapisz", glowny: true, opis: "Najpierw uzupełnij pole." },
  { rola: "button", nazwa: "Zamknięty", nieczynny: true },
  { rola: "button", nazwa: "Wyłączony", wylaczony: true },
  { rola: "textbox", nazwa: "Imię" },
];

describe("spis elementów interaktywnych", () => {
  it("zgodny spis przechodzi; ukryte, aria-hidden i tabindex=-1 nie wchodzą do spisu", () => {
    const korzen = drzewo();
    expect(spisInteraktywnych(korzen)).toHaveLength(6);
    expect(() => sprawdzSpis(korzen, ZGODNY)).not.toThrow();
  });

  it("kontrola dodatnia: nadmiarowy albo brakujący element czerwieni spis i wymienia, co znaleziono", () => {
    const korzen = drzewo();
    expect(() => sprawdzSpis(korzen, ZGODNY.slice(0, 5))).toThrow(/oczekiwano 5, jest 6/);
    expect(() => sprawdzSpis(korzen, [...ZGODNY, { rola: "button", nazwa: "Dodatkowy" }])).toThrow(/oczekiwano 7, jest 6/);
    expect(() => sprawdzSpis(korzen, ZGODNY.slice(0, 5))).toThrow(/Zamknięty/);
  });

  it("kontrola dodatnia: zła kolejność, nazwa, rola, stan, opis albo adres czerwieni spis", () => {
    const korzen = drzewo();
    const zamienione = [ZGODNY[1], ZGODNY[0], ...ZGODNY.slice(2)];
    expect(() => sprawdzSpis(korzen, zamienione)).toThrow();
    expect(() => sprawdzSpis(korzen, [{ ...ZGODNY[0], nazwa: "Wróć" }, ...ZGODNY.slice(1)])).toThrow();
    expect(() => sprawdzSpis(korzen, [{ ...ZGODNY[0], rola: "link" }, ...ZGODNY.slice(1)])).toThrow();
    expect(() => sprawdzSpis(korzen, [...ZGODNY.slice(0, 3), { ...ZGODNY[3], nieczynny: false }, ...ZGODNY.slice(4)])).toThrow();
    expect(() => sprawdzSpis(korzen, [...ZGODNY.slice(0, 4), { ...ZGODNY[4], wylaczony: false }, ZGODNY[5]])).toThrow();
    expect(() => sprawdzSpis(korzen, [ZGODNY[0], ZGODNY[1], { ...ZGODNY[2], opis: "Inne zdanie." }, ...ZGODNY.slice(3)])).toThrow();
    expect(() => sprawdzSpis(korzen, [ZGODNY[0], { ...ZGODNY[1], href: "/inny" }, ...ZGODNY.slice(2)])).toThrow();
    expect(() => sprawdzSpis(korzen, [ZGODNY[0], ZGODNY[1], { ...ZGODNY[2], glowny: false }, ...ZGODNY.slice(3)])).toThrow();
  });

  it("kontrola dodatnia: przycisk bez nazwy dostępnej czerwieni spis", () => {
    const { container } = render(<button type="button" />);
    expect(() => sprawdzSpis(container, [{ rola: "button", nazwa: "Cokolwiek" }])).toThrow();
    expect(() => sprawdzSpis(container, [{ rola: "button", nazwa: "" }])).toThrow();
  });

  it("kontrola dodatnia: dwa przyciski główne czerwienią spis, nawet gdy oba są wymienione", () => {
    const { container } = render(
      <div>
        <button type="button" className="a_primary_1">
          Pierwszy
        </button>
        <button type="button" className="a_primary_1">
          Drugi
        </button>
      </div>,
    );
    expect(() =>
      sprawdzSpis(container, [
        { rola: "button", nazwa: "Pierwszy", glowny: true },
        { rola: "button", nazwa: "Drugi", glowny: true },
      ]),
    ).toThrow();
  });

  it("rola i przycisk główny: znaczniki, jawne role, klasa atomu i znacznik kursu", () => {
    const { container } = render(
      <div>
        <a href="/x">a</a>
        <input type="checkbox" aria-label="c" />
        <input type="radio" aria-label="r" />
        <input type="submit" value="s" />
        <select aria-label="w" />
        <iframe title="ramka" />
        <span role="button" tabIndex={0}>
          jawny
        </span>
        <a href="/y" data-przycisk-glowny="">
          g
        </a>
        <button type="button" className="Button_primaryX">
          nie
        </button>
        <button type="button" className="Button_primary_9">
          tak
        </button>
      </div>,
    );
    const elementy = spisInteraktywnych(container);
    expect(elementy.map(rolaElementu)).toEqual([
      "link",
      "checkbox",
      "radio",
      "button",
      "combobox",
      "iframe",
      "button",
      "link",
      "button",
      "button",
    ]);
    expect(elementy.map(jestGlowny)).toEqual([false, false, false, false, false, false, false, true, false, true]);
  });
});

describe("nagłówki i komunikaty", () => {
  it("spis nagłówków niesie poziomy i teksty w kolejności drzewa; ukryte przed czytnikiem pomija", () => {
    const { container } = render(
      <div>
        <h1>Tytuł</h1>
        <h2>Sekcja</h2>
        <div role="heading" aria-level={3}>
          Podsekcja
        </div>
        <h2 aria-hidden="true">Ukryty</h2>
      </div>,
    );
    expect(naglowki(container)).toEqual([
      { poziom: 1, tekst: "Tytuł" },
      { poziom: 2, tekst: "Sekcja" },
      { poziom: 3, tekst: "Podsekcja" },
    ]);
  });

  it("kontrola dodatnia: przeskok poziomu (h1 → h3) i brak h1 na początku są wykrywane, zejście w górę nie", () => {
    const zPrzeskokiem = render(
      <div>
        <h1>Tytuł</h1>
        <h3>Komunikat</h3>
      </div>,
    ).container;
    expect(przeskokiNaglowkow(naglowki(zPrzeskokiem))).toEqual(["h1 → h3 „Komunikat”"]);
    cleanup();

    const bezH1 = render(<h2>Sekcja</h2>).container;
    expect(przeskokiNaglowkow(naglowki(bezH1))).toEqual(["h0 → h2 „Sekcja”"]);
    cleanup();

    const poprawny = render(
      <div>
        <h1>Tytuł</h1>
        <h2>A</h2>
        <h3>B</h3>
        <h2>C</h2>
      </div>,
    ).container;
    expect(przeskokiNaglowkow(naglowki(poprawny))).toEqual([]);
  });

  it("jeden h1 na początku: przechodzi; kontrola dodatnia: dwa h1 albo h2 przed h1 czerwienią kontrolę", () => {
    const dobry = render(
      <div>
        <h1>Tytuł</h1>
        <h2>A</h2>
      </div>,
    ).container;
    expect(() => sprawdzJedenH1(dobry)).not.toThrow();
    cleanup();

    const dwaH1 = render(
      <div>
        <h1>A</h1>
        <h1>B</h1>
      </div>,
    ).container;
    expect(() => sprawdzJedenH1(dwaH1)).toThrow();
    cleanup();

    const h2PrzedH1 = render(
      <div>
        <h2>A</h2>
        <h1>B</h1>
      </div>,
    ).container;
    expect(() => sprawdzJedenH1(h2PrzedH1)).toThrow();
  });

  it("alerty: teksty elementów z role=alert; zwykły komunikat i status nie wchodzą", () => {
    const { container } = render(
      <div>
        <div role="alert">
          <h3>Brak połączenia</h3> Spróbuj ponownie.
        </div>
        <div role="status">Zapisano</div>
        <p>Zwykły tekst</p>
      </div>,
    );
    expect(alerty(container)).toEqual(["Brak połączenia Spróbuj ponownie."]);
  });
});
