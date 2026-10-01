import { odmien } from "../wspolne/odmiana";

/**
 * Napisy pod liczbą w kaflach pulpitu uczestnika. Słownik interfejsu §6:
 * przymiotnik odmienia się według PIERWSZEJ liczby kafla (tej dużej), nie
 * według mianownika: „1 z 3 ukończony”, „2 z 5 ukończone”, „5 z 6 odbytych”.
 * „0” odmienia się jak 5.
 */

/** „z 5 ukończone” pod liczbą ukończonych kursów. */
export function mianownikUkonczonychKursow(ukonczone: number, razem: number): string {
  return `z ${razem} ${odmien(ukonczone, "ukończony", "ukończone", "ukończonych")}`;
}

/** „z 6 odbytych” pod liczbą odbytych superwizji; bez wymaganej liczby — samo słowo. */
export function mianownikOdbytychSuperwizji(odbyte: number | undefined, wymagane?: number | string): string {
  const slowo = odmien(odbyte ?? 0, "odbyta", "odbyte", "odbytych");
  return wymagane !== undefined ? `z ${wymagane} ${slowo}` : slowo;
}
