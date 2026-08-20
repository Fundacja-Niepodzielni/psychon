/**
 * Rejestr menu — panel prowadzącego (/prowadzacy).
 *
 * Jak dodać swój wpis (pakiet HXX):
 * 1. Utwórz plik `hXX-nazwa.ts` obok tego pliku (wzór: h00-start.ts).
 * 2. Dodaj swój wpis jedną linią do importów i jedną do listy poniżej.
 */
import h00Start from "./h00-start";
// import hXXNazwa from "./hXX-nazwa"; // ← dodaj swój wpis jedną linią

import { sortMenu, type MenuEntry } from "../types";

export const instructorMenu: MenuEntry[] = sortMenu([
  h00Start,
  // hXXNazwa, // ← i drugą tutaj
]);
