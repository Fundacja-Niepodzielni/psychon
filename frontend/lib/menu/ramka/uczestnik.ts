import { GRUPY, celTrasyEkranu, type DefinicjaGrupy } from "@/lib/przelaczenie/grupy";
import type { Role } from "@/lib/home-by-role";
import h01Profil from "../participant/h01-profil";
import h05Kursy from "../participant/h05-kursy";
import h11Staz from "../participant/h11-staz";
import h12Superwizja from "../participant/h12-superwizja";
import h13Certyfikat from "../participant/h13-certyfikat";
import h14Dokumenty from "../participant/h14-dokumenty";
import h15ProfilPsychologa from "../participant/h15-profil-psychologa";
import h21Start from "../participant/h21-start";
import { filterMenuByRole, type MenuEntry } from "../types";
import { GRUPA_DOTYCHCZASOWA, type GrupaMenuRamki, type PozycjaMenuRamki } from "./administracja";
import type { NazwaIkony } from "@/design-system/atomy/Icon/Icon";

/**
 * Menu uczestnika w nowej ramce panelu — układ z makiety 2.0.4 (rola `u`
 * w skrypcie `#nav`): grupa „Program” z Pulpitem i Kursami, linia „W
 * przygotowaniu”, grupa „Konto” z wylogowaniem i linią „profil · pomoc”.
 * Stoi OBOK starego rejestru (`lib/menu/participant`), który zostaje bit
 * w bit dla starej ramki (`PanelShell`).
 *
 * Zasady te same co w menu administracji (`./administracja.ts`):
 * - pozycja ekranu z włączoną grupą przełączenia prowadzi na nową trasę,
 *   bez włączonej grupy — na starą (cel czyta rejestr `celTrasyEkranu`);
 * - ekran włączany rano, którego makieta nie ma w menu („Po programie”),
 *   stoi w grupie najbliższej jego funkcji, pod nazwą swojego `h1`;
 * - funkcje starego panelu bez miejsca w menu makiety — grupa „Dotychczasowy
 *   panel” przed „Konto”, z etykietą i adresem wprost ze starego rejestru
 *   i tym samym filtrem roli co stare menu (wpis tylko dla wolontariusza
 *   jest ukryty, dopóki `/me` nie odpowie).
 */

/** Nazwy pozycji uczestnika — z makiety albo z `h1` ekranu włączonej grupy. */
export const NAZWY_RAMKI_UCZESTNIKA = {
  pulpit: "Pulpit",
  kursy: "Kursy",
  poProgramie: "Po programie",
} as const;

/** Linia „W przygotowaniu” grupy „Program” (makieta 2.0.4, rola `u`). */
export const W_PRZYGOTOWANIU_PROGRAM_UCZESTNIKA =
  "pytania i odpowiedzi · ścieżka programu · dziennik stażu · superwizja · dokumenty · zaświadczenie o ukończeniu kursu";

/** Linia „W przygotowaniu” grupy „Konto” (makieta 2.0.4, rola `u`). */
export const W_PRZYGOTOWANIU_KONTO_UCZESTNIKA = "profil · pomoc";

type Grupy = Record<string, DefinicjaGrupy>;

function cel(grupy: Grupy, klucz: keyof typeof GRUPY): string | null {
  const grupa = grupy[klucz];
  return grupa ? celTrasyEkranu(grupa, "uczestnik") : null;
}

function pozycja(href: string | null, ikona: NazwaIkony, etykieta: string, dokladna?: boolean): PozycjaMenuRamki[] {
  if (href === null) return [];
  return [dokladna ? { ikona, etykieta, href, dokladna } : { ikona, etykieta, href }];
}

const IKONY_DOTYCHCZASOWE: Record<string, NazwaIkony> = {
  "/panel/start": "home",
  "/panel/staz": "clock",
  "/panel/superwizja": "chat",
  "/panel/certyfikat": "award",
  "/panel/profil": "user",
  "/panel/dokumenty": "file",
  "/panel/profil-psychologa": "user",
};

function dotychczasowa(wpis: MenuEntry): PozycjaMenuRamki {
  return { ikona: IKONY_DOTYCHCZASOWE[wpis.href] ?? "file", etykieta: wpis.label, href: wpis.href };
}

/** Stare wpisy bez miejsca w menu makiety, w kolejności starego rejestru. */
const WPISY_DOTYCHCZASOWE: MenuEntry[] = [
  h21Start,
  h11Staz,
  h12Superwizja,
  h13Certyfikat,
  h01Profil,
  h14Dokumenty,
  h15ProfilPsychologa,
];

/**
 * Menu uczestnika nowej ramki przy danej roli z `/me` (`undefined` — przed
 * odpowiedzią) i danym stanie rejestru przełączenia.
 */
export function menuRamkiUczestnika(rola: Role | undefined, grupy: Grupy = GRUPY): GrupaMenuRamki[] {
  const n = NAZWY_RAMKI_UCZESTNIKA;
  return [
    {
      naglowek: "Program",
      pozycje: [
        ...pozycja(cel(grupy, "pulpitUczestnika"), "home", n.pulpit, true),
        ...pozycja(h05Kursy.href, "book", n.kursy),
        ...pozycja(cel(grupy, "wspolpraca"), "chat", n.poProgramie),
      ],
      wPrzygotowaniu: W_PRZYGOTOWANIU_PROGRAM_UCZESTNIKA,
    },
    {
      naglowek: GRUPA_DOTYCHCZASOWA,
      pozycje: filterMenuByRole(WPISY_DOTYCHCZASOWE, rola).map(dotychczasowa),
    },
  ].filter((grupa) => grupa.pozycje.length > 0);
}
