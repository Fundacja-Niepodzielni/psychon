import { describe, expect, it } from "vitest";
import { LUZ_SEKUND, NAJDLUZSZA_PRZERWA_SEKUND, NAJSZYBSZE_TEMPO, utworzLicznikCzasu } from "../licznikCzasu";
import { odczytajKomunikat, poleceniePozycji, polecenieSubskrypcji, pozycjaStartu } from "../protokol";

describe("odczyt komunikatu", () => {
  it("komunikat protokołu jako tekst JSON i jako obiekt", () => {
    expect(odczytajKomunikat(JSON.stringify({ context: "player.js", event: "ready" }))).toEqual({
      zdarzenie: "ready",
      pozycjaSekund: null,
    });
    expect(odczytajKomunikat({ context: "player.js", event: "timeupdate", value: { seconds: 12.5, duration: 60 } })).toEqual({
      zdarzenie: "timeupdate",
      pozycjaSekund: 12.5,
    });
  });

  it.each([
    ["zły JSON", "{"],
    ["tekst niebędący JSON-em", "ready"],
    ["JSON z liczbą", "7"],
    ["JSON z tablicą", "[1]"],
    ["JSON z null", "null"],
    ["null", null],
    ["undefined", undefined],
    ["liczba", 7],
    ["tablica", [{ context: "player.js", event: "ready" }]],
    ["funkcja", () => "ready"],
    ["brak context", { event: "ready" }],
    ["obcy context", { context: "inny", event: "ready" }],
    ["context innej wielkości liter", { context: "Player.js", event: "ready" }],
    ["brak zdarzenia", { context: "player.js" }],
    ["zdarzenie nieznane", { context: "player.js", event: "__proto__" }],
    ["zdarzenie niebędące tekstem", { context: "player.js", event: ["ready"] }],
    ["pozycja jako tekst", { context: "player.js", event: "timeupdate", value: { seconds: "3" } }],
    ["pozycja nieskończona", { context: "player.js", event: "timeupdate", value: { seconds: Infinity } }],
    ["pozycja ujemna", { context: "player.js", event: "timeupdate", value: { seconds: -0.1 } }],
    ["pozycja bez wartości", { context: "player.js", event: "timeupdate" }],
  ])("%s → null, bez wyjątku", (_opis, dane) => {
    expect(() => odczytajKomunikat(dane)).not.toThrow();
    expect(odczytajKomunikat(dane)).toBeNull();
  });

  it("obiekt z pułapką w odczycie pola nie jest podawany przez przeglądarkę, ale tekst z prototypem nie szkodzi", () => {
    expect(odczytajKomunikat('{"__proto__":{"context":"player.js","event":"ready"}}')).toBeNull();
  });
});

describe("polecenia", () => {
  it("zapis na zdarzenie i ustawienie pozycji mają kształt protokołu", () => {
    expect(JSON.parse(polecenieSubskrypcji("timeupdate"))).toEqual({
      context: "player.js",
      version: "0.0.11",
      method: "addEventListener",
      value: "timeupdate",
      listener: "nagranie-timeupdate",
    });
    expect(JSON.parse(poleceniePozycji(125))).toEqual({
      context: "player.js",
      version: "0.0.11",
      method: "setCurrentTime",
      value: 125,
    });
  });

  it("pozycja startu: tylko dodatnia i przed końcem nagrania", () => {
    expect(pozycjaStartu(125, 1800)).toBe(125);
    expect(pozycjaStartu(1799.5, 1800)).toBe(1799.5);
    for (const pozycja of [undefined, null, 0, -1, Number.NaN, Infinity, 1800, 1801]) {
      expect(pozycjaStartu(pozycja, 1800)).toBeNull();
    }
    expect(pozycjaStartu(10, 0)).toBeNull();
    expect(pozycjaStartu(10, Number.NaN)).toBeNull();
  });
});

describe("licznik czasu", () => {
  function biegnij(licznik: ReturnType<typeof utworzLicznikCzasu>, kroki: [pozycja: number, zegarMs: number, widoczna?: boolean][]) {
    let obejrzane = 0;
    let aktywne = 0;
    for (const [pozycja, zegarMs, widoczna = true] of kroki) {
      const przyrost = licznik.pozycja(pozycja, zegarMs, widoczna);
      obejrzane += przyrost.obejrzane;
      aktywne += przyrost.aktywne;
    }
    return { obejrzane, aktywne };
  }

  it("bez zgłoszonego odtwarzania pozycje nie doliczają niczego", () => {
    const licznik = utworzLicznikCzasu();
    expect(biegnij(licznik, [[0, 0], [1, 1000], [2, 2000]])).toEqual({ obejrzane: 0, aktywne: 0 });
  });

  it("odtwarzanie: sekunda pozycji na sekundę zegara", () => {
    const licznik = utworzLicznikCzasu();
    licznik.odtwarzanie();
    const kroki: [number, number][] = [];
    for (let i = 0; i <= 120; i += 1) kroki.push([i * 0.25, i * 250]);
    expect(biegnij(licznik, kroki)).toEqual({ obejrzane: 30, aktywne: 30 });
  });

  it("nierówne odstępy komunikatów nie zaniżają wyniku odcinka", () => {
    const licznik = utworzLicznikCzasu();
    licznik.odtwarzanie();
    // Pozycja idzie równo, komunikaty docierają raz wcześniej, raz później.
    const kroki: [number, number][] = [[0, 0]];
    for (let i = 1; i <= 40; i += 1) kroki.push([i * 0.25, i * 250 + (i % 2 === 0 ? 0 : 90)]);
    expect(biegnij(licznik, kroki)).toEqual({ obejrzane: 10, aktywne: 10 });
  });

  it("granice: przerwa, skok do przodu, cofnięcie", () => {
    const licznik = utworzLicznikCzasu();
    licznik.odtwarzanie();
    expect(biegnij(licznik, [[0, 0], [NAJDLUZSZA_PRZERWA_SEKUND, NAJDLUZSZA_PRZERWA_SEKUND * 1000]])).toEqual({
      obejrzane: NAJDLUZSZA_PRZERWA_SEKUND,
      aktywne: NAJDLUZSZA_PRZERWA_SEKUND,
    });

    const zPrzerwa = utworzLicznikCzasu();
    zPrzerwa.odtwarzanie();
    expect(
      biegnij(zPrzerwa, [[0, 0], [NAJDLUZSZA_PRZERWA_SEKUND + 1, (NAJDLUZSZA_PRZERWA_SEKUND + 1) * 1000]]),
    ).toEqual({ obejrzane: 0, aktywne: 0 });

    const zeSkokiem = utworzLicznikCzasu();
    zeSkokiem.odtwarzanie();
    const skok = 1 * NAJSZYBSZE_TEMPO + LUZ_SEKUND + 0.5;
    expect(biegnij(zeSkokiem, [[0, 0], [skok, 1000], [skok + 2, 3000]])).toEqual({ obejrzane: 2, aktywne: 2 });

    const zCofnieciem = utworzLicznikCzasu();
    zCofnieciem.odtwarzanie();
    expect(biegnij(zCofnieciem, [[100, 0], [40, 1000], [42, 3000]])).toEqual({ obejrzane: 2, aktywne: 2 });
  });

  it("zatrzymanie i przewinięcie zaczynają nowy odcinek; ułamki sekund nie giną między odcinkami", () => {
    const licznik = utworzLicznikCzasu();
    licznik.odtwarzanie();
    expect(biegnij(licznik, [[0, 0], [0.6, 600]])).toEqual({ obejrzane: 0, aktywne: 0 });
    licznik.przewiniecie();
    expect(biegnij(licznik, [[500, 700], [500.6, 1300]])).toEqual({ obejrzane: 1, aktywne: 1 });
    licznik.zatrzymanie();
    expect(licznik.czyOdtwarza()).toBe(false);
    expect(biegnij(licznik, [[501, 2000], [502, 3000]])).toEqual({ obejrzane: 0, aktywne: 0 });
  });

  it("karta niewidoczna: obejrzane tak, aktywne nie", () => {
    const licznik = utworzLicznikCzasu();
    licznik.odtwarzanie();
    expect(biegnij(licznik, [[0, 0, false], [3, 3000, false], [5, 5000, true]])).toEqual({ obejrzane: 5, aktywne: 2 });
  });
});
