/**
 * Jeden formater liczb dziesiętnych nowego frontu (godziny stażu, wymagane
 * godziny, sumy godzin). Każda liczba dziesiętna z API (`"3.5"`, kontrakt §1:
 * decimals as strings) przechodzi przez tę funkcję i dostaje zapis `pl-PL`:
 * przecinek zamiast kropki i wąską spację tysięcy — ten sam wynik, który atom
 * `Num` daje przez `toLocaleString("pl-PL")`. Tu `Intl.NumberFormat`, bo straż
 * jednego formatera dat zabrania `toLocale*String` w nowym froncie.
 *
 *  - `formatujDziesietny("3.5")` → „3,5”
 *  - `formatujDziesietny("2")`   → „2”
 *  - napis pusty albo niebędący liczbą wraca bez zmian, zamiast „NaN”.
 *
 * Ekran nie składa własnego formatu liczb — straż `jeden-formater-dziesietnych`
 * pilnuje, że funkcja ma jedną definicję i że `Intl.NumberFormat` stoi tylko tu.
 */
export function formatujDziesietny(tekst: string): string {
  if (tekst.trim() === "") return tekst;
  const liczba = Number(tekst);
  return Number.isFinite(liczba) ? new Intl.NumberFormat("pl-PL").format(liczba).replace(/\s/g, " ") : tekst;
}
