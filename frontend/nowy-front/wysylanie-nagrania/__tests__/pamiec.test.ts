import { describe, expect, it } from "vitest";
import {
  czyWpisWazny,
  czytajWpis,
  KLUCZ_PAMIECI,
  odciskPliku,
  POLA_WPISU,
  tenSamPlik,
  WAZNOSC_WPISU_MS,
  zapiszWpis,
  type WpisWysylania,
} from "../pamiec";
import { pamiecProbna } from "./atrapa-dostawcy";

const TERAZ = Date.UTC(2026, 9, 1, 12, 0, 0);
const GODZINA = 60 * 60 * 1000;

const WPIS: WpisWysylania = {
  idLekcji: 22,
  tytulLekcji: "Trudny rozmówca",
  adresLekcji: "/admin/kursy/4/lekcje/22",
  adresWgrania: "https://nagrania.atrapa.test/tusupload/1",
  nazwa: "trudny-rozmowca.mp4",
  rozmiar: 1000,
  zmieniono: 1_790_000_000_000,
  wyslano: 480,
  zapisano: TERAZ,
};

describe("odcisk pliku", () => {
  const plik = new File(["12345"], "wywiad.mp4", { type: "video/mp4", lastModified: 1_790_000_000_000 });

  it("składa się z nazwy, rozmiaru i daty modyfikacji", () => {
    expect(odciskPliku(plik)).toEqual({ nazwa: "wywiad.mp4", rozmiar: 5, zmieniono: 1_790_000_000_000 });
  });

  it("ten sam plik wybrany drugi raz ma ten sam odcisk", () => {
    const drugiRaz = new File(["12345"], "wywiad.mp4", { type: "video/mp4", lastModified: 1_790_000_000_000 });
    expect(tenSamPlik(odciskPliku(plik), odciskPliku(drugiRaz))).toBe(true);
  });

  it.each([
    ["inna nazwa", new File(["12345"], "wywiad-2.mp4", { lastModified: 1_790_000_000_000 })],
    ["inny rozmiar", new File(["123456"], "wywiad.mp4", { lastModified: 1_790_000_000_000 })],
    ["inna data modyfikacji", new File(["12345"], "wywiad.mp4", { lastModified: 1_790_000_000_001 })],
  ])("%s to inny plik", (_opis, inny) => {
    expect(tenSamPlik(odciskPliku(plik), odciskPliku(inny))).toBe(false);
  });

  it("typ pliku nie wchodzi do odcisku", () => {
    const bezTypu = new File(["12345"], "wywiad.mp4", { lastModified: 1_790_000_000_000 });
    expect(tenSamPlik(odciskPliku(plik), odciskPliku(bezTypu))).toBe(true);
  });
});

describe("ważność wpisu: sześć godzin od rozpoczęcia wysyłania", () => {
  it("wpis młodszy niż sześć godzin jest ważny, równo sześć godzin i starszy — nie", () => {
    expect(WAZNOSC_WPISU_MS).toBe(6 * GODZINA);
    expect(czyWpisWazny({ zapisano: TERAZ }, TERAZ)).toBe(true);
    expect(czyWpisWazny({ zapisano: TERAZ }, TERAZ + 6 * GODZINA - 1)).toBe(true);
    expect(czyWpisWazny({ zapisano: TERAZ }, TERAZ + 6 * GODZINA)).toBe(false);
    expect(czyWpisWazny({ zapisano: TERAZ }, TERAZ + 7 * GODZINA)).toBe(false);
  });

  it("wpis z przyszłości (cofnięty zegar) nie jest ważny", () => {
    expect(czyWpisWazny({ zapisano: TERAZ + 1 }, TERAZ)).toBe(false);
  });

  it("odczyt przeterminowanego wpisu zwraca brak i usuwa wpis z pamięci", () => {
    const magazyn = pamiecProbna();
    zapiszWpis(magazyn, WPIS);
    expect(czytajWpis(magazyn, TERAZ + 5 * GODZINA)).toEqual(WPIS);
    expect(czytajWpis(magazyn, TERAZ + 6 * GODZINA)).toBeNull();
    expect(magazyn.getItem(KLUCZ_PAMIECI)).toBeNull();
  });
});

describe("zapis i odczyt wpisu", () => {
  it("do pamięci trafiają wyłącznie pola z listy — pole spoza listy zostaje poza pamięcią", () => {
    const magazyn = pamiecProbna();
    const zNadmiarem = { ...WPIS, podpis: ["nie", "do", "pamieci"].join("-") } as WpisWysylania;
    zapiszWpis(magazyn, zNadmiarem);
    const zapisane = JSON.parse(magazyn.getItem(KLUCZ_PAMIECI)!) as Record<string, unknown>;
    expect(Object.keys(zapisane).sort()).toEqual([...POLA_WPISU].sort());
  });

  it.each([
    ["nie jest JSON-em", "{"],
    ["nie jest obiektem", "7"],
    ["brakuje pola", JSON.stringify({ ...WPIS, adresWgrania: undefined })],
    ["liczba zapisana napisem", JSON.stringify({ ...WPIS, rozmiar: "1000" })],
    ["wysłano więcej, niż ma plik", JSON.stringify({ ...WPIS, wyslano: 1001 })],
  ])("uszkodzony wpis (%s) jest brakiem wpisu i znika z pamięci", (_opis, surowy) => {
    const magazyn = pamiecProbna();
    magazyn.setItem(KLUCZ_PAMIECI, surowy);
    expect(czytajWpis(magazyn, TERAZ)).toBeNull();
    expect(magazyn.getItem(KLUCZ_PAMIECI)).toBeNull();
  });

  it("brak pamięci przeglądarki nie jest błędem", () => {
    expect(() => zapiszWpis(null, WPIS)).not.toThrow();
    expect(czytajWpis(null, TERAZ)).toBeNull();
  });
});
