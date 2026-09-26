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
 */

function paryZEtykiet(etykiety: readonly string[]) {
  return etykiety.map((etykieta) => ({ etykieta }));
}

function tlaZNazw(nazwy: readonly string[]) {
  return nazwy.map((nazwa) => ({ nazwa }));
}

describe("sprawdzWzgledemZnanejListy (scripts/pomiar-marginesu-kontrastu.mjs)", () => {
  it("nie rzuca, gdy zbiór par i teł dokładnie pokrywa się z listą znaną", () => {
    const pary = paryZEtykiet(ETYKIETY_PAR_ZNANE);
    const tla = tlaZNazw(NAZWY_TEL_ZNANE);
    expect(() => sprawdzWzgledemZnanejListy(pary, tla)).not.toThrow();
  });

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
