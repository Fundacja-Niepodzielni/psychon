/**
 * Dziesiętny string z API (`"41.5"`, kontrakt §1: decimals as strings) do
 * zapisu `pl-PL` z przecinkiem i wąską spacją tysięcy — ten sam wynik, który
 * atom `Num` daje przez `toLocaleString("pl-PL")`. Tu `Intl.NumberFormat`, bo
 * straż jednego formatera dat zabrania `toLocale*String` w nowym froncie.
 * Napis pusty albo niebędący liczbą wraca bez zmian, zamiast „NaN”.
 */
export function formatujDziesietny(tekst: string): string {
  if (tekst.trim() === "") return tekst;
  const liczba = Number(tekst);
  return Number.isFinite(liczba) ? new Intl.NumberFormat("pl-PL").format(liczba).replace(/\s/g, " ") : tekst;
}
