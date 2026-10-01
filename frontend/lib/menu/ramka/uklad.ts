import {
  GRUPA_DOTYCHCZASOWA,
  czyPodstronaPozycji,
  czyPozycjaBiezaca,
  type GrupaMenuRamki,
  type PodstronaMenuRamki,
} from "./administracja";
import type { NazwaIkony } from "@/design-system/atomy/Icon/Icon";

/**
 * Układ menu nowej ramki dla szablonu `PowlokaPanelu` — wspólny dla trzech
 * ról (administracja, uczestnik, prowadzący):
 * - grupa „Dotychczasowy panel” idzie osobno (`grupaZwinieta`): szablon
 *   pokazuje ją zwiniętą przyciskiem przed grupą „Konto”, żeby
 *   „Wyloguj” było widoczne bez przewijania menu;
 * - grupa z flagą `zwijana` (administracja: „Ustawienia”) zostaje w `grupy`, w swojej
 *   kolejności, a flaga przechodzi do układu — `PanelNav` rysuje ją tym samym
 *   komponentem zwijania co „Dotychczasowy panel”. Grupy bez flagi nie niosą
 *   żadnego dodatkowego pola;
 * - linia „W przygotowaniu: …” nie wymienia funkcji, które są już pozycjami
 *   menu (także w „Dotychczasowym panelu”): zbiór linii = pozycje niegotowe
 *   minus pozycje obecne w menu. Porównanie nazw bez wielkości liter
 *   („dziennik stażu” w linii == „Dziennik stażu” w menu);
 * - pozycja-rodzic bieżącej podstrony bez własnej pozycji w menu (rejestr
 *   `podstrony`) jest bieżąca jako sekcja: `biezaca: "sekcja"`.
 */

const SEPARATOR = " · ";

export interface PozycjaUkladu {
  ikona: NazwaIkony;
  etykieta: string;
  href: string;
  /** `true` — bieżąca strona; `"sekcja"` — rodzic bieżącej podstrony bez własnej pozycji w menu. */
  biezaca: boolean | "sekcja";
  podstrony?: PodstronaMenuRamki[];
}

export interface GrupaUkladu {
  naglowek: string;
  liniaWPrzygotowaniu?: string;
  pozycje: PozycjaUkladu[];
  /** Grupa zwijana przyciskiem (flaga z menu roli); brak pola — grupa rysowana wprost. */
  zwijana?: true;
}

function klucz(nazwa: string): string {
  return nazwa.trim().toLocaleLowerCase("pl");
}

/**
 * Linia „W przygotowaniu” (bez przedrostka i kropki) bez funkcji obecnych
 * w menu. Pusta po odjęciu — `undefined` (linia znika).
 */
export function liniaBezPozycjiMenu(linia: string | undefined, menu: GrupaMenuRamki[]): string | undefined {
  if (!linia) return undefined;
  const wMenu = new Set(menu.flatMap((grupa) => grupa.pozycje.map((p) => klucz(p.etykieta))));
  const zostaje = linia.split(SEPARATOR).filter((nazwa) => !wMenu.has(klucz(nazwa)));
  return zostaje.length > 0 ? zostaje.join(SEPARATOR) : undefined;
}

/** Menu roli → właściwości `grupy`, `grupaZwinieta` i `liniaKonta` szablonu `PowlokaPanelu`. */
export function ukladMenuRamki(
  menu: GrupaMenuRamki[],
  sciezka: string,
  liniaKonta?: string,
): { grupy: GrupaUkladu[]; grupaZwinieta?: GrupaUkladu; liniaKonta?: string } {
  const naUklad = (grupa: GrupaMenuRamki): GrupaUkladu => ({
    naglowek: grupa.naglowek,
    liniaWPrzygotowaniu: liniaBezPozycjiMenu(grupa.wPrzygotowaniu, menu),
    ...(grupa.zwijana ? { zwijana: true as const } : {}),
    pozycje: grupa.pozycje.map((p) => ({
      ikona: p.ikona,
      etykieta: p.etykieta,
      href: p.href,
      biezaca: czyPozycjaBiezaca(p, sciezka) ? true : czyPodstronaPozycji(p, sciezka) ? ("sekcja" as const) : false,
      ...(p.podstrony ? { podstrony: p.podstrony } : {}),
    })),
  });
  const dotychczasowa = menu.find((grupa) => grupa.naglowek === GRUPA_DOTYCHCZASOWA);
  return {
    grupy: menu.filter((grupa) => grupa !== dotychczasowa).map(naUklad),
    grupaZwinieta: dotychczasowa ? naUklad(dotychczasowa) : undefined,
    liniaKonta: liniaBezPozycjiMenu(liniaKonta, menu),
  };
}
