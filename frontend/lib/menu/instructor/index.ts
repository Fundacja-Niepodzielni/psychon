/**
 * Rejestr menu — panel prowadzącego (/prowadzacy).
 *
 * Jak dodać swój wpis (pakiet HXX):
 * 1. Utwórz plik `hXX-nazwa.ts` obok tego pliku (wzór: h00-start.ts).
 * 2. Dodaj swój wpis jedną linią do importów i jedną do listy poniżej.
 */
import h00Start from "./h00-start";
import h12Grupa from "./h12-grupa";
import h15WatekGrupowy from "./h15-watek-grupowy";
import h17Pytania from "./h17-pytania";
// import hXXNazwa from "./hXX-nazwa"; // ← dodaj swój wpis jedną linią

import { sortMenu, type MenuEntry, type MenuSection } from "../types";

export const instructorMenu: MenuEntry[] = sortMenu([
  h00Start,
  h12Grupa,
  h15WatekGrupowy,
  h17Pytania,
  // hXXNazwa, // ← i drugą tutaj
]);

/**
 * Menu prowadzącego ma cztery wpisy, więc zostaje jedną listą bez sekcji.
 */
export const instructorMenuSections: MenuSection[] = [];
