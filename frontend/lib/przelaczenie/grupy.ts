/**
 * Jedno deklaratywne źródło przełączenia ekranów nowego frontu na trasy
 * produktu (bez `nowy-front` w adresie). Rejestr menu (`frontend/lib/menu/*`)
 * czyta stąd cel wpisu — żadna trasa nie jest wpisana na sztywno w dwóch
 * miejscach naraz.
 *
 * Kształt zgodny z częścią A (mapa przełączenia): grupa → { stara trasa,
 * nowa trasa produktu, wpis menu, włączona: tak/nie }. Jedna grupa może
 * nieść więcej niż jeden ekran (np. ekran uczestnika i ekran administracji
 * tej samej funkcji) — stąd `ekrany: EkranGrupy[]`, każdy z własnym panelem
 * i własną parą tras, pod jedną wspólną flagą `wlaczona`.
 *
 * WSZYSTKIE grupy poniżej mają dziś `wlaczona: false` — to jest treść tej
 * gałęzi (`przelaczenie-mechanizm`): zachowanie produktu ma być bit w bit
 * takie samo jak na bazie `a9e515f` (menu, trasy, e2e). Gałąź świadka
 * (`przelaczenie-grupa-wspolpraca`) różni się od tej wyłącznie jedną
 * wartością — `wlaczona: true` przy grupie `wspolpraca`.
 */

/** Panel, w którym stoi ekran grupy — nazwa zgodna z katalogami `app/`. */
export type NazwaPanelu = "uczestnik" | "administracja";

/** Jeden ekran należący do grupy: para tras w jednym panelu. */
export interface EkranGrupy {
  /** Panel, którego menu ma nieść wpis do tego ekranu. */
  panel: NazwaPanelu;
  /**
   * Stara trasa produktu tej samej funkcji, albo `null`, gdy funkcji dotąd
   * w produkcie nie było (wpis menu i trasa są zupełnie nowe — grupa off
   * znaczy wtedy "wpisu jeszcze nie ma", nie "wpis wskazuje starą trasę").
   */
  staraTrasa: string | null;
  /** Nowa trasa produktu nowego ekranu (bez `nowy-front` w adresie). */
  nowaTrasa: string;
}

/** Jedna grupa przełączenia: zbiór ekranów pod wspólną flagą włączenia. */
export interface DefinicjaGrupy {
  klucz: string;
  wlaczona: boolean;
  ekrany: EkranGrupy[];
}

/**
 * Grupa „zgłoszenia dalszej współpracy” (H01) — uczestnik `po-programie`
 * (dziś: `/panel/po-programie`, ekran statusu programu bez formularza) +
 * administracja `zgloszenia-wspolpracy` (dziś: brak odpowiednika w starym
 * froncie), scalone w `9381dba`. Świadek działania mechanizmu przełączenia.
 */
export const GRUPY = {
  wspolpraca: {
    klucz: "wspolpraca",
    wlaczona: false,
    ekrany: [
      {
        panel: "uczestnik",
        staraTrasa: "/panel/po-programie",
        nowaTrasa: "/panel/dalsza-wspolpraca",
      },
      {
        panel: "administracja",
        staraTrasa: null,
        nowaTrasa: "/admin/zgloszenia-wspolpracy",
      },
    ],
  },
} as const satisfies Record<string, DefinicjaGrupy>;

export type KluczGrupy = keyof typeof GRUPY;

/**
 * Cel wpisu menu dla ekranu grupy: stara trasa, dopóki grupa jest
 * wyłączona (bit w bit jak na bazie), nowa trasa produktu, gdy grupa jest
 * włączona. `null`, gdy wpisu menu dziś w ogóle nie ma (grupa wyłączona,
 * ekran bez starej trasy) — wołający ma wtedy pominąć wpis, nie wstawiać
 * pustego `href`.
 *
 * Funkcja jest czysta i przyjmuje `DefinicjaGrupy` wprost (nie tylko klucz
 * rejestru) — dzięki temu test może sprawdzić obie gałęzie flagi bez
 * mutowania współdzielonego singletona `GRUPY`.
 */
export function celTrasyEkranu(grupa: DefinicjaGrupy, panel: NazwaPanelu): string | null {
  const ekran = grupa.ekrany.find((e) => e.panel === panel);
  if (!ekran) return null;
  return grupa.wlaczona ? ekran.nowaTrasa : ekran.staraTrasa;
}

/** Wygoda dla wołających ze znanym kluczem rejestru `GRUPY`. */
export function celTrasy(klucz: KluczGrupy, panel: NazwaPanelu): string | null {
  return celTrasyEkranu(GRUPY[klucz], panel);
}

/**
 * Czy stara trasa ekranu ma po włączeniu grupy przekierować (a nie 404) —
 * prawda dokładnie wtedy, gdy ekran miał starą trasę I grupa jest
 * włączona. Woła to strona starej trasy, nigdy sam rejestr menu.
 */
export function czyStaraTrasaPrzekierowuje(grupa: DefinicjaGrupy, panel: NazwaPanelu): boolean {
  const ekran = grupa.ekrany.find((e) => e.panel === panel);
  return !!ekran && ekran.staraTrasa !== null && grupa.wlaczona;
}
