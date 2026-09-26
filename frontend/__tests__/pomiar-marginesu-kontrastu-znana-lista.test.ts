// @vitest-environment node
//
// Środowisko `node`, nie domyślny `jsdom` z `vitest.config.ts`: przyrząd pod
// testem to skrypt CLI, który liczy własną ścieżkę z `import.meta.url` —
// pod jsdom Vite serwuje moduły przez własny transform bez realnego URL-a
// `file:`, więc `fileURLToPath(import.meta.url)` w przyrządzie rzuca. Pod
// `node` `import.meta.url` zostaje prawdziwym URL-em pliku, tak jak przy
// zwykłym `node scripts/pomiar-marginesu-kontrastu.mjs`.
import { describe, expect, it } from "vitest";

import {
  ETYKIETY_PAR_ZNANE,
  NAZWY_TEL_ZNANE,
  sprawdzWzgledemZnanejListy,
  zbudujPelnaMacierz,
  wczytajProdukcyjneParyITla,
} from "../scripts/pomiar-marginesu-kontrastu.mjs";

/**
 * Próba w drzewie dla strażnika `sprawdzWzgledemZnanejListy` w
 * `scripts/pomiar-marginesu-kontrastu.mjs`. Ten strażnik jest JEDYNYM
 * miejscem w tym pliku, które pilnuje, żeby nowa para albo nowe tło
 * (dopisane do `zbudujPary`/`zbudujTla` bez jawnej decyzji) nie weszło do
 * pomiaru po cichu — patrz komentarz przy `ETYKIETY_PAR_ZNANE` w tym pliku.
 * Wcześniej ten fakt był udowadniany tylko ręcznie, na kopii tymczasowej,
 * kasowanej po biegu — w drzewie nie zostawało nic, co tę własność mierzy.
 * Ten plik to naprawia: jeśli ktoś podmieni ciało
 * `sprawdzWzgledemZnanejListy` na `return;`, testy "rzuca, gdy..." niżej
 * przestają wykrywać naruszenie i idą na czerwono.
 *
 * WAŻNE dla trwałości tej próby: etykiety/nazwy użyte do wywołania nadmiaru
 * ("Fikcyjna..." niżej) są wymyślonymi literałami wpisanymi w TYM pliku
 * testowym, nie czymś wyliczonym przez sam `pomiar-marginesu-kontrastu.mjs`.
 * Oczekiwanie ("to ma rzucić") pochodzi więc z innego źródła niż przyrząd
 * pod testem — nie jest to porównanie wyniku z samym sobą.
 *
 * Ta sama zasada dotyczy dwóch dalszych bloków niżej:
 *   - "zbudujPelnaMacierz odmawia..." nie sprawdza `sprawdzWzgledemZnanejListy`
 *     wprost, tylko drogę PRODUKCYJNĄ (`zbudujPelnaMacierz`, linia wywołania
 *     w `scripts/pomiar-marginesu-kontrastu.mjs`) na fikcyjnej, jednoelementowej
 *     parze/tle — usunięcie samego wywołania strażnika z ciała
 *     `zbudujPelnaMacierz` (bez ruszania ciała strażnika) nie jest dziś
 *     wykrywane żadnym innym testem w tym pliku, bo wszystkie pozostałe wołają
 *     `sprawdzWzgledemZnanejListy` bezpośrednio, z pominięciem tej linii.
 *   - "wczytajProdukcyjneParyITla(): zgadza się..." buduje pary/tła PRAWDZIWĄ
 *     ścieżką (czyta `app/globals.css`, przepuszcza przez realne
 *     `zbudujPary`/`zbudujTla`) — dopisanie w drzewie szóstego tła (albo
 *     dwunastej pary) w tych funkcjach BEZ dopisania go też do
 *     `ETYKIETY_PAR_ZNANE`/`NAZWY_TEL_ZNANE` psuje TEN test, nie tylko
 *     dopiero pełne CLI. Testy "nie rzuca, gdy zbiór pokrywa się..." itd.
 *     (zobacz niżej) budowały wejście z tych samych stałych, które sprawdzają
 *     — porównanie przyrządu z samym sobą, które nie potrafi zgasnąć — więc
 *     ten blok go zastępuje realnymi `zbudujPary`/`zbudujTla` jako źródłem.
 */

function paryZEtykiet(etykiety: readonly string[]) {
  return etykiety.map((etykieta) => ({ etykieta }));
}

function tlaZNazw(nazwy: readonly string[]) {
  return nazwy.map((nazwa) => ({ nazwa }));
}

describe("sprawdzWzgledemZnanejListy (scripts/pomiar-marginesu-kontrastu.mjs)", () => {
  it("rzuca, gdy pojawia się para spoza listy znanej (nadmiar) — dopisana etykieta bez decyzji", () => {
    const pary = paryZEtykiet([
      ...ETYKIETY_PAR_ZNANE,
      "Fikcyjna etykieta spoza rejestru — test kontrastu 1",
    ]);
    const tla = tlaZNazw(NAZWY_TEL_ZNANE);
    expect(() => sprawdzWzgledemZnanejListy(pary, tla)).toThrow(/nowa\(e\) para\(y\)/);
  });

  it("rzuca, gdy znana para znika ze zbioru (niedomiar) — zaakceptowana para przestała istnieć", () => {
    const pary = paryZEtykiet(ETYKIETY_PAR_ZNANE.slice(1));
    const tla = tlaZNazw(NAZWY_TEL_ZNANE);
    expect(() => sprawdzWzgledemZnanejListy(pary, tla)).toThrow(/już nie istnieje/);
  });

  it("rzuca, gdy pojawia się tło spoza listy znanej (nadmiar) — dopisane tło bez decyzji", () => {
    const pary = paryZEtykiet(ETYKIETY_PAR_ZNANE);
    const tla = tlaZNazw([...NAZWY_TEL_ZNANE, "Fikcyjne tło spoza rejestru — test kontrastu 2"]);
    expect(() => sprawdzWzgledemZnanejListy(pary, tla)).toThrow(/nowe tło\(a\)/);
  });

  it("rzuca, gdy znane tło znika ze zbioru (niedomiar) — zaakceptowane tło przestało istnieć", () => {
    const pary = paryZEtykiet(ETYKIETY_PAR_ZNANE);
    const tla = tlaZNazw(NAZWY_TEL_ZNANE.slice(1));
    expect(() => sprawdzWzgledemZnanejListy(pary, tla)).toThrow(/już nie istnieje/);
  });
});

describe("zbudujPelnaMacierz odmawia policzenia macierzy dla wejścia spoza znanej listy (scripts/pomiar-marginesu-kontrastu.mjs)", () => {
  it("rzuca dla fikcyjnej pary spoza ETYKIETY_PAR_ZNANE — sprawdza WYWOŁANIE strażnika wewnątrz zbudujPelnaMacierz, nie samo ciało strażnika", () => {
    // Dane fikcyjne, wystarczające do przejścia pętli liczącej macierz, GDYBY
    // strażnik nie zatrzymał wykonania wcześniej — gdyby ktoś usunął samo
    // wywołanie `sprawdzWzgledemZnanejListy(pary, tla);` z ciała
    // `zbudujPelnaMacierz`, ta para/tło policzyłyby się bez błędu (etykieta
    // "Fikcyjna..." nie pasuje do żadnego wpisu w WYKLUCZENIA, więc trafia w
    // zwykłą gałąź liczenia kontrastu), i to `expect(...).toThrow(...)` niżej
    // by nie przeszło.
    const paraSpozaListy = {
      etykieta: "Fikcyjna para spoza listy — test wywołania strażnika",
      textRgb: [0, 0, 0],
      bgHexLubNull: null,
      prog: 4.5,
    };
    const tloZnane = { nazwa: "Karta biała", rgb: [255, 255, 255] };
    expect(() => zbudujPelnaMacierz([paraSpozaListy], [tloZnane])).toThrow(/nowa\(e\) para\(y\)/);
  });
});

describe("wczytajProdukcyjneParyITla(): zgadza się z ETYKIETY_PAR_ZNANE/NAZWY_TEL_ZNANE (scripts/pomiar-marginesu-kontrastu.mjs)", () => {
  it("nie rzuca dla par/teł zbudowanych PRAWDZIWĄ ścieżką produkcyjną (czyta app/globals.css, przechodzi przez realne zbudujPary/zbudujTla)", () => {
    const { pary, tla } = wczytajProdukcyjneParyITla();
    // Dopisanie w drzewie nowej pary w `zbudujPary` albo nowego tła w
    // `zbudujTla` bez dopisania go też do `ETYKIETY_PAR_ZNANE`/
    // `NAZWY_TEL_ZNANE` sprawia, że `pary`/`tla` niżej mają element, którego
    // strażnik nie zna — ten test (oczekujący braku rzutu) idzie wtedy na
    // czerwono, bez potrzeby uruchamiania CLI.
    expect(() => sprawdzWzgledemZnanejListy(pary, tla)).not.toThrow();
    expect(pary.length).toBe(ETYKIETY_PAR_ZNANE.length);
    expect(tla.length).toBe(NAZWY_TEL_ZNANE.length);
  });
});
