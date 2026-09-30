/**
 * Rejestr menu — panel administracji (/admin).
 *
 * Jak dodać swój wpis (pakiet HXX):
 * 1. Utwórz plik `hXX-nazwa.ts` obok tego pliku (wzór: h19-pulpit.ts).
 * 2. Dodaj swój wpis jedną linią do importów i jedną do listy poniżej.
 */
import h08Kursy from "./h08-kursy";
import h07CzasNauki from "./h07-czas-nauki";
import h11Staz from "./h11-staz";
import h13Certyfikaty from "./h13-certyfikaty";
import h12Superwizje from "./h12-superwizje";
import h12Sprawy from "./h12-sprawy";
import h16Emails from "./h16-emails";
import h18Uczestniczki from "./h18-uczestniczki";
import h19Pulpit from "./h19-pulpit";
import h19Ustawienia from "./h19-ustawienia";
import h15Profil from "./h15-profil";
import h20Raport from "./h20-raport";
import h20Dziennik from "./h20-dziennik";
import h21EkranStartowy from "./h21-ekran-startowy";
import h22WzoryDokumentow from "./h22-wzory-dokumentow";
import h01ZgloszeniaWspolpracy from "./h01-zgloszenia-wspolpracy";
// import hXXNazwa from "./hXX-nazwa"; // ← dodaj swój wpis jedną linią

import { sortMenu, type MenuEntry, type MenuSection } from "../types";

export const adminMenu: MenuEntry[] = sortMenu([
  h19Pulpit,
  h07CzasNauki,
  h08Kursy,
  h19Ustawienia,
  h18Uczestniczki,
  h13Certyfikaty,
  h11Staz,
  h12Superwizje,
  h12Sprawy,
  h15Profil,
  h16Emails,
  h20Raport,
  h20Dziennik,
  h21EkranStartowy,
  h22WzoryDokumentow,
  // Wpis grupy przełączenia `wspolpraca` (`lib/przelaczenie/grupy.ts`) —
  // tablica 0/1 elementów: pusta, dopóki grupa jest wyłączona (bit w bit
  // jak na bazie, patrz `h01-zgloszenia-wspolpracy.ts`), jeden wpis po
  // włączeniu. Rozpłaszczona `...`, żeby ta lista nie potrzebowała gałęzi
  // `if` na wpis, którego dziś może tu nie być.
  ...h01ZgloszeniaWspolpracy,
  // hXXNazwa, // ← i drugą tutaj
]);

/**
 * Sekcje menu administracji. Wpis wskazuje sekcję polem section; Pulpit stoi
 * nad sekcjami, bez nagłówka.
 */
export const adminMenuSections: MenuSection[] = [
  { id: "nauka", label: "Nauka", order: 10 },
  { id: "osoby", label: "Osoby", order: 20 },
  { id: "praktyka", label: "Praktyka", order: 30 },
  { id: "obsluga", label: "Obsługa", order: 40 },
  { id: "raporty", label: "Raporty", order: 50 },
  { id: "konfiguracja", label: "Konfiguracja", order: 60 },
];
