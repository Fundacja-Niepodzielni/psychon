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
import h16Emails from "./h16-emails";
import h18Uczestniczki from "./h18-uczestniczki";
import h19Pulpit from "./h19-pulpit";
import h19Ustawienia from "./h19-ustawienia";
import h15Profil from "./h15-profil";
import h20Raport from "./h20-raport";
import h20Dziennik from "./h20-dziennik";
// import hXXNazwa from "./hXX-nazwa"; // ← dodaj swój wpis jedną linią

import { sortMenu, type MenuEntry } from "../types";

export const adminMenu: MenuEntry[] = sortMenu([
  h19Pulpit,
  h07CzasNauki,
  h08Kursy,
  h19Ustawienia,
  h18Uczestniczki,
  h11Staz,
  h15Profil,
  h16Emails,
  h20Raport,
  h20Dziennik,
  // hXXNazwa, // ← i drugą tutaj
]);
