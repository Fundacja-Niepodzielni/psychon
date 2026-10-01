import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  dniOczekiwania,
  slowoDni,
  tekstPlakietkiCzekania,
  tekstWieku,
  wariantPlakietkiCzekania,
} from "../wiek";

const DOBA = 24 * 60 * 60 * 1000;
const TERAZ = Date.parse("2026-10-01T12:00:00Z");

describe("próg ostrzeżenia plakietki „czeka N dni”", () => {
  it("4 dni: plakietka szara; 5 dni: ostrzegawcza; powyżej: ostrzegawcza", () => {
    expect(wariantPlakietkiCzekania(4)).toBe("neutral");
    expect(wariantPlakietkiCzekania(5)).toBe("warn");
    expect(wariantPlakietkiCzekania(6)).toBe("warn");
    expect(wariantPlakietkiCzekania(0)).toBe("neutral");
  });
});

describe("dniOczekiwania — dni kalendarzowe czasu warszawskiego", () => {
  it("liczy daty kalendarzowe, nie pełne doby (znacznik 12:00 UTC to 14:00 w Warszawie)", () => {
    expect(dniOczekiwania("2026-10-01T11:59:00Z", TERAZ)).toBe(0);
    expect(dniOczekiwania("2026-09-30T12:00:00Z", TERAZ)).toBe(1);
    // Mniej niż doba temu, ale w poprzednim dniu kalendarzowym: 1, a nie 0.
    expect(dniOczekiwania("2026-09-30T12:00:01Z", TERAZ)).toBe(1);
    expect(dniOczekiwania(new Date(TERAZ - 5 * DOBA).toISOString(), TERAZ)).toBe(5);
    expect(dniOczekiwania(new Date(TERAZ - 4 * DOBA - 1000).toISOString(), TERAZ)).toBe(4);
    expect(dniOczekiwania("2026-09-27T21:59:59Z", TERAZ)).toBe(4);
  });

  it("granica doby: wczoraj 23:59 → dziś 00:01 (czas warszawski) to 1 dzień, mimo dwóch minut różnicy", () => {
    // 30.09 23:59 w Warszawie = 21:59Z, 1.10 00:01 w Warszawie = 22:01Z (lato, UTC+2).
    expect(dniOczekiwania("2026-09-30T21:59:00Z", Date.parse("2026-09-30T22:01:00Z"))).toBe(1);
    // Tuż przed północą jeszcze 0.
    expect(dniOczekiwania("2026-09-30T21:59:00Z", Date.parse("2026-09-30T21:59:59Z"))).toBe(0);
  });

  it("zgłoszenie z dziś 00:01 do dziś 23:59 (czas warszawski) to 0, „od dziś”; o północy 1", () => {
    const czekaOd = "2026-09-30T22:01:00Z"; // 1.10 00:01 w Warszawie
    expect(dniOczekiwania(czekaOd, Date.parse("2026-10-01T21:59:00Z"))).toBe(0); // 1.10 23:59
    expect(dniOczekiwania(czekaOd, Date.parse("2026-10-01T21:59:59.999Z"))).toBe(0);
    expect(dniOczekiwania(czekaOd, Date.parse("2026-10-01T22:00:00Z"))).toBe(1); // 2.10 00:00
  });

  it("znacznik UTC, który w Warszawie jest już następnym dniem: liczy się dzień warszawski, nie UTC", () => {
    // 22:30Z latem to 00:30 następnego dnia w Warszawie.
    expect(dniOczekiwania("2026-09-30T22:30:00Z", Date.parse("2026-10-01T10:00:00Z"))).toBe(0);
    expect(dniOczekiwania("2026-09-30T22:30:00Z", Date.parse("2026-10-02T10:00:00Z"))).toBe(1);
    // Zimą 23:30Z to 00:30 następnego dnia (UTC+1), a 22:30Z to jeszcze ten sam dzień.
    expect(dniOczekiwania("2026-12-14T23:30:00Z", Date.parse("2026-12-15T10:00:00Z"))).toBe(0);
    expect(dniOczekiwania("2026-12-14T22:30:00Z", Date.parse("2026-12-15T10:00:00Z"))).toBe(1);
  });

  it("zmiana czasu jesienią (25.10.2026, doba 25 h): wiek przez tę noc rośnie dokładnie o 1", () => {
    // 25.10 trwa od 24.10 22:00Z do 25.10 23:00Z (25 godzin).
    const polnoc = "2026-10-24T22:00:00Z"; // 25.10 00:00 CEST
    expect(dniOczekiwania(polnoc, Date.parse("2026-10-25T22:59:00Z"))).toBe(0); // 25.10 23:59 CET
    expect(dniOczekiwania(polnoc, Date.parse("2026-10-25T23:00:00Z"))).toBe(1); // 26.10 00:00 CET
    // Przez noc zmiany czasu: 24.10 23:30 → 25.10 00:30, 02:30 (CEST), 02:30 (CET), 03:30.
    const wieczor = "2026-10-24T21:30:00Z"; // 24.10 23:30 CEST
    for (const teraz of ["2026-10-24T22:30:00Z", "2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z", "2026-10-25T02:30:00Z"]) {
      expect(dniOczekiwania(wieczor, Date.parse(teraz)), teraz).toBe(1);
    }
    // To samo południe przed zmianą i po niej: 24.10 12:00 → 25.10 12:00 → 26.10 12:00.
    const poludnie24 = "2026-10-24T10:00:00Z";
    expect(dniOczekiwania(poludnie24, Date.parse("2026-10-25T11:00:00Z"))).toBe(1);
    expect(dniOczekiwania(poludnie24, Date.parse("2026-10-26T11:00:00Z"))).toBe(2);
  });

  it("zmiana czasu wiosną (29.03.2026, doba 23 h): wiek przez tę noc rośnie dokładnie o 1", () => {
    // 29.03 trwa od 28.03 23:00Z do 29.03 22:00Z (23 godziny).
    const polnoc = "2026-03-28T23:00:00Z"; // 29.03 00:00 CET
    expect(dniOczekiwania(polnoc, Date.parse("2026-03-29T21:59:00Z"))).toBe(0); // 29.03 23:59 CEST
    expect(dniOczekiwania(polnoc, Date.parse("2026-03-29T22:00:00Z"))).toBe(1); // 30.03 00:00 CEST
    // Przez noc zmiany czasu: 28.03 23:30 → 29.03 00:30, 01:30 (CET), 03:30 (CEST).
    const wieczor = "2026-03-28T22:30:00Z"; // 28.03 23:30 CET
    for (const teraz of ["2026-03-28T23:30:00Z", "2026-03-29T00:30:00Z", "2026-03-29T01:30:00Z"]) {
      expect(dniOczekiwania(wieczor, Date.parse(teraz)), teraz).toBe(1);
    }
    const poludnie28 = "2026-03-28T11:00:00Z";
    expect(dniOczekiwania(poludnie28, Date.parse("2026-03-29T10:00:00Z"))).toBe(1);
    expect(dniOczekiwania(poludnie28, Date.parse("2026-03-30T10:00:00Z"))).toBe(2);
  });

  it("przełom miesiąca, roku i lutego (rok zwykły i przestępny)", () => {
    expect(dniOczekiwania("2026-01-31T12:00:00Z", Date.parse("2026-02-01T12:00:00Z"))).toBe(1);
    expect(dniOczekiwania("2026-12-31T12:00:00Z", Date.parse("2027-01-01T12:00:00Z"))).toBe(1);
    expect(dniOczekiwania("2026-12-31T23:30:00Z", Date.parse("2027-01-01T10:00:00Z"))).toBe(0); // 1.01 00:30 w Warszawie
    expect(dniOczekiwania("2026-02-28T12:00:00Z", Date.parse("2026-03-01T12:00:00Z"))).toBe(1);
    expect(dniOczekiwania("2028-02-28T12:00:00Z", Date.parse("2028-03-01T12:00:00Z"))).toBe(2);
    expect(dniOczekiwania("2026-09-01T12:00:00Z", TERAZ)).toBe(30);
  });

  it("data bez godziny (YYYY-MM-DD) jest odczytana jak północ UTC, czyli ten sam dzień w Warszawie", () => {
    expect(dniOczekiwania("2026-09-30", TERAZ)).toBe(1);
    expect(dniOczekiwania("2026-10-01", TERAZ)).toBe(0);
  });

  it("brak daty albo data nieczytelna: null (ekran niczego nie zgaduje); chwila „teraz” nieczytelna też", () => {
    expect(dniOczekiwania("", TERAZ)).toBeNull();
    expect(dniOczekiwania("nie-data", TERAZ)).toBeNull();
    expect(dniOczekiwania("2026-09-30T12:00:00Z", Number.NaN)).toBeNull();
  });

  it("chwila w przyszłości (rozjazd zegarów) daje 0, nie liczbę ujemną", () => {
    expect(dniOczekiwania("2026-10-05T12:00:00Z", TERAZ)).toBe(0);
    // Jutro w Warszawie, choć mniej niż doba po „teraz”.
    expect(dniOczekiwania("2026-10-01T22:30:00Z", TERAZ)).toBe(0);
  });
});

describe("dniOczekiwania — strefa jawna, nie strefa maszyny", () => {
  const zrodlo = readFileSync(join(__dirname, "..", "wiek.ts"), "utf8");

  it("plik podaje strefę Europe/Warsaw jawnie do Intl i nie czyta strefy maszyny", () => {
    expect(zrodlo).toMatch(/const STREFA_DNIA = "Europe\/Warsaw";/);
    expect(zrodlo).toMatch(/timeZone: STREFA_DNIA/);
    expect(zrodlo).not.toMatch(/\.(getFullYear|getMonth|getDate|getDay|getHours|getTimezoneOffset)\(/);
    expect(zrodlo).not.toMatch(/\bnew Date\(\)|Date\.now\(/);
  });

  it("wiek liczy tylko ten plik: żadna inna część nowego frontu nie ma własnej doby w milisekundach", () => {
    const korzen = join(__dirname, "..", "..");
    const pliki: string[] = [];
    const przejdz = (katalog: string) => {
      for (const wpis of readdirSync(katalog, { withFileTypes: true })) {
        const sciezka = join(katalog, wpis.name);
        if (wpis.isDirectory()) {
          if (wpis.name !== "__tests__") przejdz(sciezka);
        } else if (/\.(ts|tsx)$/.test(wpis.name) && !/\.test\./.test(wpis.name)) {
          pliki.push(sciezka);
        }
      }
    };
    przejdz(korzen);
    expect(pliki.length).toBeGreaterThan(50);
    const winowajcy = pliki.filter(
      (plik) =>
        plik !== join(korzen, "sprawy", "wiek.ts") &&
        /MS_NA_DOBE|24 \* 60 \* 60 \* 1000|86_?400_?000/.test(readFileSync(plik, "utf8")),
    );
    expect(winowajcy).toEqual([]);
  });
});

describe("odmiana i tekst plakietki", () => {
  it("„dzień” tylko przy 1, w pozostałych przypadkach „dni”", () => {
    expect([0, 1, 2, 5, 22].map(slowoDni)).toEqual(["dni", "dzień", "dni", "dni", "dni"]);
  });

  it("tekst plakietki: „czeka od dziś” przy 0, „czeka 1 dzień”, „czeka N dni” dla pozostałych", () => {
    expect(tekstPlakietkiCzekania(5)).toBe("czeka 5 dni");
    expect(tekstPlakietkiCzekania(1)).toBe("czeka 1 dzień");
    expect(tekstPlakietkiCzekania(0)).toBe("czeka od dziś");
    expect(tekstPlakietkiCzekania(2)).toBe("czeka 2 dni");
    expect(tekstPlakietkiCzekania(22)).toBe("czeka 22 dni");
  });

  it("część wieku z jednej funkcji: „od dziś”, „1 dzień”, „2 dni”, „5 dni”, „22 dni”", () => {
    expect([0, 1, 2, 5, 22].map(tekstWieku)).toEqual(["od dziś", "1 dzień", "2 dni", "5 dni", "22 dni"]);
  });

  it("plakietka składa się z części wieku: „czeka ” + tekstWieku(N) dla każdego N", () => {
    for (const dni of [0, 1, 2, 4, 5, 22]) {
      expect(tekstPlakietkiCzekania(dni)).toBe(`czeka ${tekstWieku(dni)}`);
    }
  });
});
