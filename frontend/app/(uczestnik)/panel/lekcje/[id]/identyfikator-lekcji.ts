/**
 * Identyfikator lekcji z adresu `/panel/lekcje/[id]`: dodatnia liczba całkowita, inaczej `null`
 * (serwer odpowiada wtedy 404). Jedno źródło dla układu segmentu i strony.
 */
export function identyfikatorLekcji(id: string): number | null {
  const liczba = Number(id);
  return Number.isSafeInteger(liczba) && liczba > 0 ? liczba : null;
}
