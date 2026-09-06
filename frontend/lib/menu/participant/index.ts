/**
 * Rejestr menu — panel uczestnika (/panel).
 *
 * Jak dodać swój wpis (pakiet HXX):
 * 1. Utwórz plik `hXX-nazwa.ts` obok tego pliku (wzór: h21-start.ts).
 * 2. Dodaj swój wpis jedną linią do importów i jedną do listy poniżej.
 */
import h21Start from "./h21-start";
import pulpit from "./pulpit";
import h05Kursy from "./h05-kursy";
import h11Staz from "./h11-staz";
import h01Profil from "./h01-profil";
import h14Dokumenty from "./h14-dokumenty";
import h13Certyfikat from "./h13-certyfikat";
import h15ProfilPsychologa from "./h15-profil-psychologa";
// import hXXNazwa from "./hXX-nazwa"; // ← dodaj swój wpis jedną linią

import { sortMenu, type MenuEntry } from "../types";

export const participantMenu: MenuEntry[] = sortMenu([
  h21Start,
  pulpit,
  h05Kursy,
  h11Staz,
  h01Profil,
  h14Dokumenty,
  h13Certyfikat,
  h15ProfilPsychologa,
  // hXXNazwa, // ← i drugą tutaj
]);
