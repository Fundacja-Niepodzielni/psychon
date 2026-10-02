/**
 * Zdania dla czytnika ekranu po zmianie kolejności — jedno źródło dla każdej
 * listy ze strzałkami. „Miejsce” liczy się w obrębie listy (albo grupy, np.
 * tematu), w której wiersz stoi po ruchu; `liczba` to długość tej listy.
 */

/** Ruch w obrębie tej samej listy: „Przeniesiono „Wywiad” na miejsce 2 z 3.” */
export function zdanieRuchuWiersza(tytul: string, miejsce: number, liczba: number): string {
  return `Przeniesiono „${tytul}” na miejsce ${miejsce} z ${liczba}.`;
}

/** Przejście do innej grupy (tematu): zdanie niesie nazwę grupy, do której wiersz trafił. */
export function zdanieRuchuMiedzyGrupami(tytul: string, grupa: string, miejsce: number, liczba: number): string {
  return `Przeniesiono „${tytul}” do tematu „${grupa}”, miejsce ${miejsce} z ${liczba}.`;
}

/** Ruch samej grupy (tematu) na liście grup. */
export function zdanieRuchuGrupy(tytul: string, miejsce: number, liczba: number): string {
  return `Przeniesiono temat „${tytul}” na miejsce ${miejsce} z ${liczba}.`;
}
