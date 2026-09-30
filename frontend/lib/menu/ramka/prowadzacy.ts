import type { NazwaIkony } from "@/design-system/atomy/Icon/Icon";
import { GRUPY, celTrasyEkranu, type DefinicjaGrupy } from "@/lib/przelaczenie/grupy";
import h08Kursy from "../instructor/h08-kursy";
import h12Grupa from "../instructor/h12-grupa";
import h15WatekGrupowy from "../instructor/h15-watek-grupowy";
import h17Pytania from "../instructor/h17-pytania";
import type { MenuEntry } from "../types";
import { GRUPA_DOTYCHCZASOWA, type GrupaMenuRamki, type PozycjaMenuRamki } from "./administracja";

/**
 * Menu prowadzącego w nowej ramce panelu — układ z makiety 2.0.4 (rola `p`
 * w skrypcie `#nav`): „Codziennie” z Pulpitem, „Program” z Moimi kursami
 * i linią „W przygotowaniu”, „Konto” z wylogowaniem i linią „profil
 * prowadzącego · pomoc”. Stoi OBOK starego rejestru (`lib/menu/instructor`),
 * który zostaje bit w bit dla starej ramki (`PanelShell`).
 *
 * Pulpit prowadzi na trasę z rejestru przełączenia (`/prowadzacy` w obu
 * stanach grupy — ten sam adres, stary wpis „Start” wskazuje ten sam ekran,
 * więc w grupie „Dotychczasowy panel” go nie ma). Pozostałe stare funkcje
 * bez miejsca w menu makiety stoją w „Dotychczasowym panelu” z etykietą
 * i adresem wprost ze starego rejestru.
 */

export const NAZWY_RAMKI_PROWADZACEGO = {
  pulpit: "Pulpit",
  mojeKursy: "Moje kursy",
} as const;

/** Linia „W przygotowaniu” grupy „Program” (makieta 2.0.4, rola `p`). */
export const W_PRZYGOTOWANIU_PROGRAM_PROWADZACEGO = "moja grupa · superwizja";

/** Linia „W przygotowaniu” grupy „Konto” (makieta 2.0.4, rola `p`). */
export const W_PRZYGOTOWANIU_KONTO_PROWADZACEGO = "profil prowadzącego · pomoc";

type Grupy = Record<string, DefinicjaGrupy>;

function pozycja(href: string | null, ikona: NazwaIkony, etykieta: string, dokladna?: boolean): PozycjaMenuRamki[] {
  if (href === null) return [];
  return [dokladna ? { ikona, etykieta, href, dokladna } : { ikona, etykieta, href }];
}

const IKONY_DOTYCHCZASOWE: Record<string, NazwaIkony> = {
  "/prowadzacy/grupa": "users",
  "/prowadzacy/watek-grupowy": "chat",
  "/prowadzacy/pytania": "inbox",
};

function dotychczasowa(wpis: MenuEntry): PozycjaMenuRamki {
  return { ikona: IKONY_DOTYCHCZASOWE[wpis.href] ?? "file", etykieta: wpis.label, href: wpis.href };
}

/** Menu prowadzącego nowej ramki przy danym stanie rejestru przełączenia. */
export function menuRamkiProwadzacego(grupy: Grupy = GRUPY): GrupaMenuRamki[] {
  const n = NAZWY_RAMKI_PROWADZACEGO;
  const pulpit = grupy.pulpitProwadzacego ? celTrasyEkranu(grupy.pulpitProwadzacego, "prowadzacy") : null;
  return [
    { naglowek: "Codziennie", pozycje: pozycja(pulpit, "home", n.pulpit, true) },
    {
      naglowek: "Program",
      pozycje: pozycja(h08Kursy.href, "book", n.mojeKursy),
      wPrzygotowaniu: W_PRZYGOTOWANIU_PROGRAM_PROWADZACEGO,
    },
    {
      naglowek: GRUPA_DOTYCHCZASOWA,
      pozycje: [h12Grupa, h15WatekGrupowy, h17Pytania].map(dotychczasowa),
    },
  ].filter((grupa) => grupa.pozycje.length > 0);
}
