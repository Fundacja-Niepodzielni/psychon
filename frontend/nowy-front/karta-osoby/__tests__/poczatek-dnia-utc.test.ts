import { describe, expect, it } from "vitest";
import { czySkraca, dataKalendarzowa, poczatekDniaUTC } from "../daneDostepu";

/**
 * `poczatekDniaUTC` składa początek dnia z roku, miesiąca i dnia (`Date.UTC`),
 * zamiast parsować napis z północą UTC. Wynik musi być bit w bit taki jak przy
 * parsowaniu, także na granicach roku, w roku przestępnym i w dniach zmiany
 * czasu w Warszawie (ostatnia niedziela marca i października) — północ UTC nie
 * zależy od strefy czasowej, więc doba ma tam zawsze 86 400 000 ms.
 *
 * Oczekiwane wartości pochodzą z `Date.UTC` podanego jawnie rok po roku, nie
 * z napisu z godziną.
 */

const MS_DOBY = 86_400_000;

/** [dzień `YYYY-MM-DD`, oczekiwana wartość z `Date.UTC(rok, miesiąc - 1, dzień)`] */
const DNI: ReadonlyArray<readonly [string, number]> = [
  ["1970-01-01", Date.UTC(1970, 0, 1)],
  ["2026-12-31", Date.UTC(2026, 11, 31)],
  ["2027-01-01", Date.UTC(2027, 0, 1)],
  ["2027-02-28", Date.UTC(2027, 1, 28)],
  ["2027-03-01", Date.UTC(2027, 2, 1)],
  ["2028-02-28", Date.UTC(2028, 1, 28)],
  ["2028-02-29", Date.UTC(2028, 1, 29)],
  ["2028-03-01", Date.UTC(2028, 2, 1)],
  // Zmiana czasu w Warszawie na letni: 28.03.2027 i 26.03.2028.
  ["2027-03-27", Date.UTC(2027, 2, 27)],
  ["2027-03-28", Date.UTC(2027, 2, 28)],
  ["2027-03-29", Date.UTC(2027, 2, 29)],
  ["2028-03-26", Date.UTC(2028, 2, 26)],
  // Zmiana czasu w Warszawie na zimowy: 25.10.2026 i 31.10.2027.
  ["2026-10-24", Date.UTC(2026, 9, 24)],
  ["2026-10-25", Date.UTC(2026, 9, 25)],
  ["2026-10-26", Date.UTC(2026, 9, 26)],
  ["2027-10-31", Date.UTC(2027, 9, 31)],
  ["2099-12-31", Date.UTC(2099, 11, 31)],
];

describe("poczatekDniaUTC — wartość taka sama jak przy parsowaniu północy UTC", () => {
  it.each(DNI)("%s → %d", (dzien, oczekiwana) => {
    expect(poczatekDniaUTC(dzien)).toBe(oczekiwana);
    expect(dataKalendarzowa(dzien)).toBe(dzien);
  });

  it.each(DNI)("%s: napis ISO to ten sam dzień i północ UTC, a jego parsowanie daje tę samą wartość getTime()", (dzien, oczekiwana) => {
    const data = new Date(poczatekDniaUTC(dzien));
    const [czescDaty, czescGodziny] = data.toISOString().split("T");
    expect(czescDaty).toBe(dzien);
    expect(czescGodziny).toBe("00:00:00.000Z");
    // Parsowanie napisu z północą UTC (dawny sposób) i składanie z `Date.UTC` to jedna wartość.
    expect(new Date(data.toISOString()).getTime()).toBe(oczekiwana);
    expect(data.getTime()).toBe(oczekiwana);
  });

  it("kolejne dni różnią się o dokładnie dobę, także w dniach zmiany czasu w Warszawie", () => {
    const dniZmianyCzasu: ReadonlyArray<readonly [string, string]> = [
      ["2027-03-27", "2027-03-28"],
      ["2027-03-28", "2027-03-29"],
      ["2028-03-25", "2028-03-26"],
      ["2028-03-26", "2028-03-27"],
      ["2026-10-24", "2026-10-25"],
      ["2026-10-25", "2026-10-26"],
      ["2027-10-30", "2027-10-31"],
      ["2027-10-31", "2027-11-01"],
      ["2026-12-31", "2027-01-01"],
      ["2028-02-28", "2028-02-29"],
      ["2028-02-29", "2028-03-01"],
    ];
    for (const [pierwszy, drugi] of dniZmianyCzasu) {
      expect(poczatekDniaUTC(drugi) - poczatekDniaUTC(pierwszy), `${pierwszy} → ${drugi}`).toBe(MS_DOBY);
    }
  });
});

describe("czySkraca na granicach — wybrany dzień kontra północ UTC obecnej daty", () => {
  const obecna = (rok: number, miesiac: number, dzien: number, ms = 0) =>
    new Date(Date.UTC(rok, miesiac - 1, dzien) + ms).toISOString();

  it.each([
    ["2026-12-31", obecna(2027, 1, 1), true],
    ["2027-01-01", obecna(2027, 1, 1), false],
    ["2027-01-02", obecna(2027, 1, 1), false],
    ["2028-02-29", obecna(2028, 3, 1), true],
    ["2028-03-01", obecna(2028, 3, 1), false],
    ["2027-03-28", obecna(2027, 3, 28), false],
    ["2027-03-28", obecna(2027, 3, 28, 1), true],
    ["2027-03-27", obecna(2027, 3, 28), true],
    ["2026-10-25", obecna(2026, 10, 25), false],
    ["2026-10-25", obecna(2026, 10, 25, 1), true],
    ["2026-10-24", obecna(2026, 10, 25), true],
  ] as const)("wybrano %s przy obecnej dacie %s → %s", (wybrana, obecnaData, oczekiwane) => {
    expect(czySkraca(obecnaData, wybrana)).toBe(oczekiwane);
  });

  it("brak obecnej daty, nieistniejący dzień i napis nie do odczytania nie skracają", () => {
    expect(czySkraca(null, "2027-03-28")).toBe(false);
    expect(czySkraca(obecna(2027, 3, 28), "2027-02-30")).toBe(false);
    expect(czySkraca("nie-data", "2027-03-28")).toBe(false);
  });
});
