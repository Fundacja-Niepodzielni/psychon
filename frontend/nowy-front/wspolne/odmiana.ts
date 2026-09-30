/**
 * Polska odmiana rzeczownika przy liczbie: 1 · 2-4 (poza 12-14) · pozostałe.
 * „0” odmienia się jak 5 („0 osób”). Ten sam algorytm co `odmien` w
 * `pulpit-prowadzacego/dane.ts`; ekrany, które dopiero odmieniają liczebniki,
 * biorą go stąd.
 *
 * Przykład: `odmien(22, "osoba", "osoby", "osób")` daje „osoby”.
 */
export function odmien(liczba: number, jeden: string, kilka: string, wiele: string): string {
  if (liczba === 1) return jeden;
  const reszta10 = liczba % 10;
  const reszta100 = liczba % 100;
  return reszta10 >= 2 && reszta10 <= 4 && !(reszta100 >= 12 && reszta100 <= 14) ? kilka : wiele;
}
