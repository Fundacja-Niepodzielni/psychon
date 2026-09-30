/**
 * Jedno deklaratywne źródło przełączenia ekranów nowego frontu na trasy
 * produktu (bez `nowy-front` w adresie). Rejestr menu (`frontend/lib/menu/*`)
 * czyta stąd cel wpisu — żadna trasa nie jest wpisana na sztywno w dwóch
 * miejscach naraz.
 *
 * Kształt: grupa → { stara trasa, nowa trasa produktu, włączona: tak/nie }.
 * Jedna grupa może nieść więcej niż jeden ekran (np. ekran uczestnika i
 * ekran administracji tej samej funkcji) — stąd `ekrany: EkranGrupy[]`,
 * każdy z własnym panelem i własną parą tras, pod jedną wspólną flagą
 * `wlaczona`.
 *
 * Rejestr zna każdy ekran, który stoi dziś pod segmentem nowego frontu
 * (`app/nowy-front/**\/page.tsx`) — pilnuje tego test w tym katalogu. Grupa
 * wyłączona nie zmienia niczego: menu, trasy i strony starego frontu są
 * bit w bit takie, jakby rejestru nie było.
 *
 * Dwa sposoby przełączenia ekranu, wybierane samą parą tras:
 * - stara trasa różna od nowej — stara strona przekierowuje na nową
 *   (bez 404), nowa strona żyje w grupie tras `(przelaczenie)`;
 * - stara trasa równa nowej — adres się nie zmienia, strona pod tym adresem
 *   zamienia treść na ekran nowego frontu;
 * - stara trasa `null` — funkcji dotąd w produkcie nie było, powstaje tylko
 *   nowa trasa i wpis menu.
 */

/** Panel, w którym stoi ekran grupy — nazwa zgodna z katalogami `app/`. */
export type NazwaPanelu = "uczestnik" | "administracja" | "prowadzacy";

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
  /**
   * Dzisiejsza trasa ekranu pod segmentem nowego frontu (adres strony
   * `app/nowy-front/**\/page.tsx`). Po przełączeniu ta trasa zostaje na
   * miejscu; rejestr trzyma ją po to, by żaden ekran nie został poza mapą.
   */
  trasaPoligonu: string;
}

/** Jedna grupa przełączenia: zbiór ekranów pod wspólną flagą włączenia. */
export interface DefinicjaGrupy {
  klucz: string;
  wlaczona: boolean;
  ekrany: EkranGrupy[];
}

/**
 * Grupy dzisiejszego kanonu. Wszystkie poza `wspolpraca` mają tu jeszcze
 * tylko opis docelowej pary tras: stronę pod nową trasą, wpis menu i
 * zamianę treści starej strony dokłada dopiero zmiana, która daną grupę
 * włącza — test w tym katalogu nie pozwala włączyć grupy bez nich.
 */
export const GRUPY = {
  /**
   * Zgłoszenia dalszej współpracy (H01) — uczestnik `po-programie` (dziś
   * `/panel/po-programie`, ekran statusu programu bez formularza) oraz
   * administracja (funkcji w starym froncie nie było).
   */
  wspolpraca: {
    klucz: "wspolpraca",
    wlaczona: false,
    ekrany: [
      {
        panel: "uczestnik",
        staraTrasa: "/panel/po-programie",
        nowaTrasa: "/panel/dalsza-wspolpraca",
        trasaPoligonu: "/nowy-front/po-programie",
      },
      {
        panel: "administracja",
        staraTrasa: null,
        nowaTrasa: "/admin/zgloszenia-wspolpracy",
        trasaPoligonu: "/nowy-front/admin/zgloszenia-wspolpracy",
      },
    ],
  },
  /** Słownik form stażu (H11) — administracja, funkcji dotąd nie było. */
  formyStazu: {
    klucz: "formyStazu",
    wlaczona: false,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: null,
        nowaTrasa: "/admin/formy-stazu",
        trasaPoligonu: "/nowy-front/admin/formy-stazu",
      },
    ],
  },
  /**
   * Skrzynka e-maili z ustawieniami powiadomień (H16) — ten sam adres co
   * dzisiejsza skrzynka, treść strony zamienia się na ekran nowego frontu.
   */
  powiadomienia: {
    klucz: "powiadomienia",
    wlaczona: false,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: "/admin/emails",
        nowaTrasa: "/admin/emails",
        trasaPoligonu: "/nowy-front/admin/powiadomienia",
      },
    ],
  },
  /**
   * Terminy superwizji z edycją i odwołaniem (H12) — ten sam adres co
   * dzisiejsza lista terminów administracji.
   */
  superwizje: {
    klucz: "superwizje",
    wlaczona: false,
    ekrany: [
      {
        panel: "administracja",
        staraTrasa: "/admin/superwizje",
        nowaTrasa: "/admin/superwizje",
        trasaPoligonu: "/nowy-front/admin/superwizje",
      },
    ],
  },
  /**
   * Kurs: tematy i lekcje (H08) — ekran prowadzącego, dane z tras
   * `/instructor/…`; ten sam adres co dzisiejszy szczegół kursu prowadzącego.
   */
  kurs: {
    klucz: "kurs",
    wlaczona: false,
    ekrany: [
      {
        panel: "prowadzacy",
        staraTrasa: "/prowadzacy/kursy/[id]",
        nowaTrasa: "/prowadzacy/kursy/[id]",
        trasaPoligonu: "/nowy-front/kurs/[id]",
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
 * prawda dokładnie wtedy, gdy ekran miał starą trasę RÓŻNĄ od nowej i grupa
 * jest włączona. Gdy adres się nie zmienia, strona zamienia treść zamiast
 * przekierowywać (przekierowanie na siebie samą byłoby pętlą). Woła to
 * strona starej trasy, nigdy sam rejestr menu.
 */
export function czyStaraTrasaPrzekierowuje(grupa: DefinicjaGrupy, panel: NazwaPanelu): boolean {
  const ekran = grupa.ekrany.find((e) => e.panel === panel);
  return (
    !!ekran && ekran.staraTrasa !== null && ekran.staraTrasa !== ekran.nowaTrasa && grupa.wlaczona
  );
}

/**
 * Czy nowa trasa produktu ma być osiągalna: dopiero po włączeniu grupy.
 * Wyłączona grupa zostawia adres tak, jak wyglądał na bazie (404), więc
 * strona w grupie tras `(przelaczenie)` woła to i przy fałszu kończy się
 * `notFound()`.
 */
export function czyNowaTrasaDostepna(grupa: DefinicjaGrupy): boolean {
  return grupa.wlaczona;
}
