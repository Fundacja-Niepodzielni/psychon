/**
 * Czas lekcji dla osoby: MINUTY. Serwer trzyma sekundy (`duration_seconds`).
 * Jedna funkcja przeliczenia dla formularza lekcji i dla wiersza drzewa kursu:
 * zaokrąglenie w górę, więc lekcja z dodatnim czasem nigdy nie pokazuje 0 min.
 */
export function minutyZSekund(sekundy: number): number {
  return sekundy > 0 ? Math.ceil(sekundy / 60) : 0;
}

/** Sekundy z minut wpisanych przez osobę — przeliczenie dopiero przy wysyłce. */
export function sekundyZMinut(minuty: number): number {
  return minuty * 60;
}
