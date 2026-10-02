import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { KOMUNIKAT_INTERNET, KOMUNIKAT_SERWER, KOMUNIKAT_ZAPIS } from "../komunikaty";

/**
 * Trzy wspólne zdania o błędach mają jedno, ustalone brzmienie. Test pilnuje
 * go co do znaku, bo to zdania, które osoba czyta na wielu ekranach.
 */
describe("wspólne komunikaty o błędach", () => {
  it("serwer nie odpowiedział albo zwrócił błąd", () => {
    expect(KOMUNIKAT_SERWER).toBe("Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.");
  });

  it("brak internetu", () => {
    expect(KOMUNIKAT_INTERNET).toBe("Brak połączenia z internetem. Sprawdź połączenie i spróbuj ponownie.");
  });

  it("zapis się nie powiódł", () => {
    expect(KOMUNIKAT_ZAPIS).toBe("Nie udało się zapisać. Spróbuj ponownie.");
  });

  it("żadne zdanie nie ma podwójnej spacji ani spacji na brzegach", () => {
    for (const zdanie of [KOMUNIKAT_SERWER, KOMUNIKAT_INTERNET, KOMUNIKAT_ZAPIS]) {
      expect(zdanie).toBe(zdanie.trim());
      expect(zdanie).not.toMatch(/\s{2,}/);
    }
  });
});

/**
 * Strażnik tekstów: ekrany nie wracają do dawnych, technicznych zdań o błędach
 * („Serwer nie odpowiedział…”, „Backend … nieosiągalny”). Czyta źródła ekranów
 * (bez testów i bez ekranu karty osoby), pomija komentarze i szuka tylko tych
 * zdań, które osoba mogłaby zobaczyć. Każdy wzorzec ma próbkę, którą musi wykryć
 * — inaczej pomiar byłby ślepy.
 */
const KORZEN = process.cwd();
const POMIJANE_KATALOGI = new Set(["__tests__", "karta-osoby"]);

function plikiZrodel(katalog: string): string[] {
  const pelny = join(KORZEN, katalog);
  if (!existsSync(pelny)) return [];
  return readdirSync(pelny).flatMap((nazwa) => {
    const sciezka = join(pelny, nazwa);
    if (statSync(sciezka).isDirectory()) {
      return POMIJANE_KATALOGI.has(nazwa) ? [] : plikiZrodel(relative(KORZEN, sciezka));
    }
    return /\.(ts|tsx)$/.test(nazwa) ? [sciezka] : [];
  });
}

/** Zostawia kod i teksty; usuwa komentarze blokowe i wiersze będące samym komentarzem. */
function bezKomentarzy(zrodlo: string): string {
  return zrodlo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const DAWNE_ZDANIA: ReadonlyArray<{ wzorzec: RegExp; probka: string }> = [
  { wzorzec: /Serwer (nie odpowiedział|jest nieosiągalny|zwrócił błąd|odrzucił|odmówił|nie zwrócił|nie pozwala)/, probka: "Serwer nie odpowiedział albo zwrócił błąd." },
  { wzorzec: /\bBackend\b/, probka: "Backend nie odpowiedział poprawnie." },
  { wzorzec: /nieosiągalny albo zwrócił/, probka: "Jest nieosiągalny albo zwrócił błąd." },
  { wzorzec: /nie (są|jest) zmyślan/, probka: "Liczby nie są zmyślane bez danych." },
  { wzorzec: /Źródło „\$\{/, probka: "`Źródło „${nazwa}” nieosiągalne`" },
  { wzorzec: /Sprawdź połączenie z internetem i spróbuj jeszcze raz/, probka: "Sprawdź połączenie z internetem i spróbuj jeszcze raz." },
  { wzorzec: /Brak (połączenia z serwerem|odpowiedzi serwera)/, probka: "Brak połączenia z serwerem. Sprawdź internet." },
  { wzorzec: /potwierdza serwer po zapisie/, probka: "Dokładną datę potwierdza serwer po zapisie." },
  { wzorzec: /trafia jako UTC/, probka: "Do zapisu trafia jako UTC." },
  { wzorzec: /Coś poszło nie tak po naszej stronie/, probka: "Coś poszło nie tak po naszej stronie." },
  { wzorzec: /chwilowo nieosiągalne/, probka: "Sprawy są chwilowo nieosiągalne." },
];

describe("strażnik tekstów o błędach", () => {
  const pliki = plikiZrodel("nowy-front");

  it("pomiar czyta źródła ekranów (nie jest pusty) i nie sięga do testów ani karty osoby", () => {
    expect(pliki.length).toBeGreaterThan(100);
    const wzgledne = pliki.map((p) => relative(KORZEN, p).replace(/\\/g, "/"));
    expect(wzgledne.some((p) => p.includes("/__tests__/"))).toBe(false);
    expect(wzgledne.some((p) => p.includes("/karta-osoby/"))).toBe(false);
    expect(wzgledne).toContain("nowy-front/wspolne/komunikaty.ts");
  });

  it("każdy wzorzec wykrywa swoją próbkę (kontrola dodatnia)", () => {
    for (const { wzorzec, probka } of DAWNE_ZDANIA) {
      expect(wzorzec.test(probka), String(wzorzec)).toBe(true);
    }
  });

  it("komentarz o dawnym zdaniu nie jest trafieniem, to samo zdanie w kodzie jest", () => {
    const zKomentarzem = "// Serwer nie odpowiedział\n/** Backend nieosiągalny */\nconst a = 1;\n";
    expect(DAWNE_ZDANIA.some(({ wzorzec }) => wzorzec.test(bezKomentarzy(zKomentarzem)))).toBe(false);
    const wKodzie = 'const opis = "Serwer nie odpowiedział albo zwrócił błąd.";\n';
    expect(DAWNE_ZDANIA.some(({ wzorzec }) => wzorzec.test(bezKomentarzy(wKodzie)))).toBe(true);
  });

  it("żaden ekran nie zawiera dawnych, technicznych zdań o błędach", () => {
    const trafienia: string[] = [];
    for (const plik of pliki) {
      const zrodlo = bezKomentarzy(readFileSync(plik, "utf-8"));
      for (const { wzorzec } of DAWNE_ZDANIA) {
        if (wzorzec.test(zrodlo)) trafienia.push(`${relative(KORZEN, plik).replace(/\\/g, "/")}: ${String(wzorzec)}`);
      }
    }
    expect(trafienia).toEqual([]);
  });
});
