import { describe, expect, it } from "vitest";
import {
  formatujDate,
  formatujDateICzas,
  formatujDateZDniemTygodnia,
  formatujGodzine,
  numerDniaKalendarzowego,
  poczatekNastepnegoDniaWarszawskiego,
} from "../daty";

/**
 * Wspólny formater dat nowego frontu: dzień „30 września 2026”, dzień z godziną
 * „30 września 2026, 20:50”, strefa Europe/Warsaw, brak wartości → „—”.
 */

describe("formatujDate", () => {
  it("znacznik UTC z wieczora tego samego dnia: dzień w Warszawie", () => {
    expect(formatujDate("2026-09-30T18:50:00Z")).toBe("30 września 2026");
  });

  it("granica UTC/Warszawa: 22:30 UTC we wrześniu to już następny dzień, 1 października", () => {
    expect(formatujDate("2026-09-30T22:30:00Z")).toBe("1 października 2026");
  });

  it("granica UTC/Warszawa w zimie: 23:30 UTC to już następny dzień", () => {
    expect(formatujDate("2026-12-31T23:30:00Z")).toBe("1 stycznia 2027");
  });

  it("dzień bez zera wiodącego i miesiąc słownie w dopełniaczu", () => {
    expect(formatujDate("2026-09-05T10:00:00Z")).toBe("5 września 2026");
  });

  it("data kalendarzowa bez godziny nie zmienia dnia", () => {
    expect(formatujDate("2026-09-22")).toBe("22 września 2026");
    expect(formatujDate("2026-01-01")).toBe("1 stycznia 2026");
  });

  it.each([null, undefined, "", "   ", "to nie jest data"])("brak albo nieczytelna wartość %j → „—”", (wartosc) => {
    expect(formatujDate(wartosc as string | null | undefined)).toBe("—");
  });
});

describe("formatujDateICzas", () => {
  it("czas letni: 18:50 UTC to 20:50 w Warszawie", () => {
    expect(formatujDateICzas("2026-09-30T18:50:00Z")).toBe("30 września 2026, 20:50");
  });

  it("czas zimowy: 16:05 UTC to 17:05 w Warszawie", () => {
    expect(formatujDateICzas("2026-11-10T16:05:00Z")).toBe("10 listopada 2026, 17:05");
  });

  it("zmiana czasu 2026-10-25: przed 01:00 UTC obowiązuje czas letni, od 01:00 UTC zimowy", () => {
    expect(formatujDateICzas("2026-10-25T00:30:00Z")).toBe("25 października 2026, 02:30");
    expect(formatujDateICzas("2026-10-25T01:30:00Z")).toBe("25 października 2026, 02:30");
    expect(formatujDateICzas("2026-10-25T02:30:00Z")).toBe("25 października 2026, 03:30");
  });

  it("zmiana czasu 2026-03-29: przed 01:00 UTC czas zimowy, od 01:00 UTC letni", () => {
    expect(formatujDateICzas("2026-03-29T00:30:00Z")).toBe("29 marca 2026, 01:30");
    expect(formatujDateICzas("2026-03-29T01:30:00Z")).toBe("29 marca 2026, 03:30");
  });

  it("granica UTC/Warszawa: 22:30 UTC to 00:30 następnego dnia, godzina z zerem wiodącym", () => {
    expect(formatujDateICzas("2026-09-30T22:30:00Z")).toBe("1 października 2026, 00:30");
  });

  it("godzina z zerem wiodącym: 09:12", () => {
    expect(formatujDateICzas("2026-09-25T07:12:00Z")).toBe("25 września 2026, 09:12");
  });

  it("bez sekund i bez nazwy strefy", () => {
    const tekst = formatujDateICzas("2026-09-25T15:05:41Z");
    expect(tekst).toBe("25 września 2026, 17:05");
    expect(tekst).not.toMatch(/UTC|GMT|:41/);
  });

  it("data kalendarzowa bez godziny pokazuje sam dzień", () => {
    expect(formatujDateICzas("2026-09-22")).toBe("22 września 2026");
  });

  it.each([null, undefined, "", "to nie jest data"])("brak albo nieczytelna wartość %j → „—”", (wartosc) => {
    expect(formatujDateICzas(wartosc as string | null | undefined)).toBe("—");
  });

  it("wynik nigdy nie zawiera znacznika ISO", () => {
    expect(formatujDateICzas("2026-09-30T18:50:00Z")).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe("numerDniaKalendarzowego", () => {
  const dzien = (iso: string) => numerDniaKalendarzowego(Date.parse(iso));

  it("początek epoki: 1970-01-01 01:00 w Warszawie to dzień 0", () => {
    expect(numerDniaKalendarzowego(0)).toBe(0);
  });

  it("północ warszawska: 23:59 i 00:01 sąsiednich dni różnią się o 1, cała doba ma jeden numer", () => {
    expect(dzien("2026-09-30T22:01:00Z") - dzien("2026-09-30T21:59:00Z")).toBe(1);
    expect(dzien("2026-10-01T21:59:00Z")).toBe(dzien("2026-09-30T22:01:00Z"));
  });

  it("znacznik UTC, który w Warszawie jest już następnym dniem, ma numer tego następnego dnia", () => {
    expect(dzien("2026-09-30T22:30:00Z")).toBe(dzien("2026-10-01T10:00:00Z"));
    expect(dzien("2026-12-31T23:30:00Z")).toBe(dzien("2027-01-01T10:00:00Z"));
  });

  it("zmiana czasu jesienią (25.10.2026, doba 25 h): od 00:00 do 23:59 jeden numer, następna doba o 1 więcej", () => {
    const poczatekDoby = dzien("2026-10-24T22:00:00Z"); // 25.10 00:00 czasu letniego
    expect(dzien("2026-10-25T22:59:00Z")).toBe(poczatekDoby); // 25.10 23:59 czasu zimowego, 25 godzin później
    expect(dzien("2026-10-25T23:00:00Z") - poczatekDoby).toBe(1); // 26.10 00:00
    expect(poczatekDoby - dzien("2026-10-24T21:59:00Z")).toBe(1); // 24.10 23:59
  });

  it("zmiana czasu wiosną (29.03.2026, doba 23 h): od 00:00 do 23:59 jeden numer, następna doba o 1 więcej", () => {
    const poczatekDoby = dzien("2026-03-28T23:00:00Z"); // 29.03 00:00 czasu zimowego
    expect(dzien("2026-03-29T21:59:00Z")).toBe(poczatekDoby); // 29.03 23:59 czasu letniego, 23 godziny później
    expect(dzien("2026-03-29T22:00:00Z") - poczatekDoby).toBe(1); // 30.03 00:00
    expect(poczatekDoby - dzien("2026-03-28T22:59:00Z")).toBe(1); // 28.03 23:59
  });

  it("chwila nieskończona nie jest liczbą dnia: Intl rzuca (dniOczekiwania sprawdza to wcześniej i daje null)", () => {
    expect(() => numerDniaKalendarzowego(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => numerDniaKalendarzowego(Number.NaN)).toThrow(RangeError);
  });
});

describe("formatujDateZDniemTygodnia", () => {
  it("czas zimowy: 17:00 UTC to czwartek, 5 listopada 2026, 18:00", () => {
    expect(formatujDateZDniemTygodnia("2026-11-05T17:00:00Z")).toBe("czwartek, 5 listopada 2026, 18:00");
  });

  it("czas letni: 16:00 UTC to 18:00 w Warszawie", () => {
    expect(formatujDateZDniemTygodnia("2026-07-15T16:00:00Z")).toBe("środa, 15 lipca 2026, 18:00");
  });

  it("dzień tygodnia liczony w Warszawie, nie w UTC: 23:30 UTC w piątek to już sobota", () => {
    expect(formatujDateZDniemTygodnia("2026-11-06T23:30:00Z")).toBe("sobota, 7 listopada 2026, 00:30");
  });

  it("zmiana czasu 2026-10-25: 00:30 UTC to niedziela 02:30 CEST, 01:30 UTC to niedziela 02:30 CET", () => {
    expect(formatujDateZDniemTygodnia("2026-10-25T00:30:00Z")).toBe("niedziela, 25 października 2026, 02:30");
    expect(formatujDateZDniemTygodnia("2026-10-25T01:30:00Z")).toBe("niedziela, 25 października 2026, 02:30");
  });

  it("strefa nie zależy od strefy przeglądarki: wynik dla stałego znacznika jest jeden", () => {
    expect(formatujDateZDniemTygodnia("2026-11-05T17:00:00.000+00:00")).toBe("czwartek, 5 listopada 2026, 18:00");
  });

  it.each([null, undefined, "", "   ", "to nie jest data"])("brak albo nieczytelna wartość %j → „—”", (wartosc) => {
    expect(formatujDateZDniemTygodnia(wartosc as string | null | undefined)).toBe("—");
  });
});

describe("formatujGodzine", () => {
  it("sama godzina w Warszawie: zimą +1 h, latem +2 h", () => {
    expect(formatujGodzine("2026-11-05T17:00:00Z")).toBe("18:00");
    expect(formatujGodzine("2026-07-15T16:05:00Z")).toBe("18:05");
  });

  it("północ w Warszawie to 00:00, nie 24:00", () => {
    expect(formatujGodzine("2026-11-05T23:00:00Z")).toBe("00:00");
  });

  it.each([null, undefined, "", "to nie jest data"])("brak albo nieczytelna wartość %j → „—”", (wartosc) => {
    expect(formatujGodzine(wartosc as string | null | undefined)).toBe("—");
  });
});

describe("poczatekNastepnegoDniaWarszawskiego", () => {
  const ms = (iso: string) => new Date(iso).getTime();
  const iso = (liczba: number | null) => (liczba === null ? null : new Date(liczba).toISOString());

  it("zima: webinar o 18:00 w czwartek kończy okno o północy, czyli 23:00 UTC tego dnia", () => {
    expect(iso(poczatekNastepnegoDniaWarszawskiego(ms("2026-11-05T17:00:00Z")))).toBe("2026-11-05T23:00:00.000Z");
  });

  it("lato: północ w Warszawie to 22:00 UTC", () => {
    expect(iso(poczatekNastepnegoDniaWarszawskiego(ms("2026-07-15T16:00:00Z")))).toBe("2026-07-15T22:00:00.000Z");
  });

  it("ostatnia sekunda dnia i pierwsza sekunda następnego mają różne końce", () => {
    expect(iso(poczatekNastepnegoDniaWarszawskiego(ms("2026-11-05T22:59:59Z")))).toBe("2026-11-05T23:00:00.000Z");
    expect(iso(poczatekNastepnegoDniaWarszawskiego(ms("2026-11-05T23:00:00Z")))).toBe("2026-11-06T23:00:00.000Z");
  });

  it("koniec października: sobota 24.10 (czas letni) kończy się o 22:00 UTC", () => {
    expect(iso(poczatekNastepnegoDniaWarszawskiego(ms("2026-10-24T20:00:00Z")))).toBe("2026-10-24T22:00:00.000Z");
  });

  it("dzień zmiany czasu 25.10 trwa 25 godzin: webinar o 11:00 CET kończy okno o 23:00 UTC, nie o 22:00", () => {
    expect(iso(poczatekNastepnegoDniaWarszawskiego(ms("2026-10-25T10:00:00Z")))).toBe("2026-10-25T23:00:00.000Z");
    // Webinar z nocy zmiany czasu (02:30 CEST) też kończy się o północy po 25 godzinach dnia.
    expect(iso(poczatekNastepnegoDniaWarszawskiego(ms("2026-10-25T00:30:00Z")))).toBe("2026-10-25T23:00:00.000Z");
  });

  it("wiosenna zmiana czasu 29.03 (dzień 23-godzinny): koniec o 22:00 UTC", () => {
    expect(iso(poczatekNastepnegoDniaWarszawskiego(ms("2026-03-29T10:00:00Z")))).toBe("2026-03-29T22:00:00.000Z");
    expect(iso(poczatekNastepnegoDniaWarszawskiego(ms("2026-03-28T23:30:00Z")))).toBe("2026-03-29T22:00:00.000Z");
  });

  it("wartość nieskończona albo nieczytelna → null", () => {
    expect(poczatekNastepnegoDniaWarszawskiego(Number.NaN)).toBeNull();
    expect(poczatekNastepnegoDniaWarszawskiego(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
