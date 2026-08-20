/**
 * Rejestr menu — panel uczestnika (/panel).
 *
 * Jak dodać swój wpis (pakiet HXX):
 * 1. Utwórz plik `hXX-nazwa.ts` obok tego pliku (wzór: h21-start.ts).
 * 2. Dodaj swój wpis jedną linią do importów i jedną do listy poniżej.
 */
import h21Start from "./h21-start";
import h01Profil from "./h01-profil";
// import hXXNazwa from "./hXX-nazwa"; // ← dodaj swój wpis jedną linią

import { sortMenu, type MenuEntry } from "../types";

export const participantMenu: MenuEntry[] = sortMenu([
  h21Start,
  h01Profil,
  // hXXNazwa, // ← i drugą tutaj
]);
