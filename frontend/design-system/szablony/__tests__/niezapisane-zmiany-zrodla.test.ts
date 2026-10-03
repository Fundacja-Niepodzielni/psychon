// @vitest-environment node

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Świadek źródeł: pytanie o niezapisane zmiany ma JEDEN mechanizm
 * (`design-system/szablony/NiezapisaneZmiany.tsx`).
 *
 * 1. `beforeunload` stoi wyłącznie w pliku mechanizmu — poza zamkniętą listą
 *    wyjątków z powodem.
 * 2. Żadna powłoka nie podaje ramie gołego `router.push`: `onNawigacja` to
 *    `przejdz` z `useNawigacjaZPytaniem`.
 * 3. Każdy ekran z formularzem albo zapisem zgłasza się do mechanizmu — poza
 *    zamkniętą listą wyjątków z powodem.
 *
 * Każda lista wyjątków czerwieni się w obie strony: gdy pojawi się plik spoza
 * listy i gdy na liście zostanie plik, który wyjątku już nie potrzebuje.
 */

const KORZEN_ZRODEL = fileURLToPath(new URL("../../../", import.meta.url));
const MECHANIZM = "design-system/szablony/NiezapisaneZmiany.tsx";
const KATALOGI = ["nowy-front", "app/(przelaczenie)", "design-system/szablony"];

/** Własna obsługa `beforeunload` poza mechanizmem — plik i powód. */
const WYJATKI_ZAMKNIECIA_KARTY: Record<string, string> = {
  "nowy-front/wysylanie-nagrania/PasekWysylania.tsx":
    "pytanie przeglądarki przy trwającym wysyłaniu nagrania — inny powód niż niezapisane zmiany",
  "nowy-front/lekcja-edycja/StronaLekcji.tsx":
    "pytanie przeglądarki przy trwającym wysyłaniu nagrania z tej strony — inny powód niż niezapisane zmiany",
};

/** Katalog ekranu z zapisem, który się NIE zgłasza — katalog i powód. */
const WYJATKI_ZGLOSZENIA: Record<string, string> = {
  "publikacja-kursu": "brak formularza: publikacja i usunięcie kursu to decyzje jednym kliknięciem",
  "wysylanie-nagrania": "nie ma pól do utracenia: trwające wysyłanie nagrania to osobny powód pytania",
};

/** Pliki, w których stoi zgłoszenie ekranu — każdy musi wołać mechanizm. */
const PLIKI_ZGLASZAJACE = [
  "nowy-front/dziennik-stazu/DziennikStazu.tsx",
  "nowy-front/ekran-startowy/EkranStartowy.tsx",
  "nowy-front/formy-stazu/FormyStazu.tsx",
  "nowy-front/karta-osoby/KartaOsoby.tsx",
  "nowy-front/kurs-administracji/KolumnaBoczna.tsx",
  "nowy-front/kurs-tematy/KursTematy.tsx",
  "nowy-front/kursy-administracji/KursyAdministracji.tsx",
  "nowy-front/lekcja-edycja/LekcjaEdycja.tsx",
  "nowy-front/lekcja-edycja/StronaLekcji.tsx",
  "nowy-front/nowa-osoba/NowaOsoba.tsx",
  "nowy-front/po-programie-wspolpraca/PoProgramieWspolpraca.tsx",
  "nowy-front/powiadomienia-email/PowiadomieniaEmail.tsx",
  "nowy-front/profil-decyzja/PanelDecyzji.tsx",
  "nowy-front/profil-psychologa-formularz/ProfilPsychologa.tsx",
  "nowy-front/skrzynka-pytan/SkrzynkaPytan.tsx",
  "nowy-front/staz-kolejka/StazKolejka.tsx",
  "nowy-front/superwizje-terminy/SuperwizjeTerminy.tsx",
  "nowy-front/ustawienia-edycji/UstawieniaEdycji.tsx",
  "nowy-front/wzory-dokumentow/WzoryDokumentow.tsx",
  "nowy-front/zaproszenia-kursu/ZaproszeniaKursu.tsx",
  "nowy-front/zgloszenia-lista/ZgloszeniaLista.tsx",
  "nowy-front/zgloszenia-wspolpracy/ZgloszeniaWspolpracy.tsx",
  "nowy-front/zgloszenie-decyzja/PanelDecyzji.tsx",
];

const WZORZEC_ZAPISU = /SaveBar|onZapisz|zapisz\(/;
const WZORZEC_ZGLOSZENIA = /useZgloszenieNiezapisanychZmian\(/;

function plikiZrodel(katalog: string): string[] {
  const wynik: string[] = [];
  for (const nazwa of readdirSync(katalog)) {
    if (nazwa === "__tests__" || nazwa === "node_modules") continue;
    const sciezka = join(katalog, nazwa);
    if (statSync(sciezka).isDirectory()) wynik.push(...plikiZrodel(sciezka));
    else if (/\.tsx?$/.test(nazwa)) wynik.push(sciezka);
  }
  return wynik;
}

function wzgledna(sciezka: string): string {
  return relative(KORZEN_ZRODEL, sciezka).split(sep).join("/");
}

const ZRODLA = new Map(
  KATALOGI.flatMap((katalog) => plikiZrodel(join(KORZEN_ZRODEL, katalog))).map(
    (sciezka) => [wzgledna(sciezka), readFileSync(sciezka, "utf8")] as const,
  ),
);

describe("zamknięcie karty — jedna obsługa", () => {
  it("`beforeunload` stoi w pliku mechanizmu", () => {
    expect(ZRODLA.get(MECHANIZM)).toContain('addEventListener("beforeunload"');
  });

  it("poza mechanizmem `beforeunload` mają wyłącznie pliki z listy wyjątków — i każdy z listy nadal go ma", () => {
    const zObsluga = Array.from(ZRODLA.entries())
      .filter(([plik, tresc]) => plik !== MECHANIZM && tresc.includes("beforeunload"))
      .map(([plik]) => plik)
      .sort();
    expect(zObsluga).toEqual(Object.keys(WYJATKI_ZAMKNIECIA_KARTY).sort());
  });
});

describe("powłoki — nawigacja menu przez mechanizm", () => {
  const powloki = Array.from(ZRODLA.entries()).filter(
    ([plik, tresc]) => plik.startsWith("app/(przelaczenie)/") && tresc.includes("<PowlokaPanelu"),
  );

  it("są trzy powłoki: administracji, uczestnika i prowadzącego", () => {
    expect(powloki.map(([plik]) => plik).sort()).toEqual([
      "app/(przelaczenie)/admin/PowlokaAdministracji.tsx",
      "app/(przelaczenie)/panel/PowlokaUczestnika.tsx",
      "app/(przelaczenie)/prowadzacy/PowlokaProwadzacego.tsx",
    ]);
  });

  it.each(powloki)("%s: `onNawigacja` to `przejdz` z `useNawigacjaZPytaniem`", (_plik, tresc) => {
    const podane = Array.from(tresc.matchAll(/onNawigacja=\{([^\n]*)\}\s*$/gm)).map((trafienie) => trafienie[1]);
    expect(podane).toEqual(["przejdz"]);
    expect(tresc).toMatch(/const \{ przejdz \} = useNawigacjaZPytaniem\(\);/);
    expect(tresc).toContain('from "@/design-system/szablony/NiezapisaneZmiany"');
  });
});

describe("ekrany — zgłoszenie do mechanizmu", () => {
  it.each(PLIKI_ZGLASZAJACE)("%s zgłasza niezapisane zmiany", (plik) => {
    expect(ZRODLA.has(plik), `plik istnieje: ${plik}`).toBe(true);
    expect(ZRODLA.get(plik)).toMatch(WZORZEC_ZGLOSZENIA);
  });

  it("zgłoszenia stoją wyłącznie w plikach z listy (lista jest pełna)", () => {
    const zglaszajace = Array.from(ZRODLA.entries())
      .filter(([plik, tresc]) => plik.startsWith("nowy-front/") && WZORZEC_ZGLOSZENIA.test(tresc))
      .map(([plik]) => plik)
      .sort();
    expect(zglaszajace).toEqual([...PLIKI_ZGLASZAJACE].sort());
  });

  it("każdy katalog ekranu z formularzem albo zapisem zgłasza się — poza listą wyjątków, a każdy wyjątek jest nadal potrzebny", () => {
    const katalog = (plik: string) => plik.split("/")[1];
    const zZapisem = new Set<string>();
    const zglaszajace = new Set<string>();
    for (const [plik, tresc] of ZRODLA) {
      if (!plik.startsWith("nowy-front/")) continue;
      if (WZORZEC_ZAPISU.test(tresc)) zZapisem.add(katalog(plik));
      if (WZORZEC_ZGLOSZENIA.test(tresc)) zglaszajace.add(katalog(plik));
    }
    const bezZgloszenia = Array.from(zZapisem)
      .filter((nazwa) => !zglaszajace.has(nazwa))
      .sort();
    expect(bezZgloszenia).toEqual(Object.keys(WYJATKI_ZGLOSZENIA).sort());
  });
});
