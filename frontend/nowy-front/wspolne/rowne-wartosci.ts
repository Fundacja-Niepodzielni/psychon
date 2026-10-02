/**
 * Porównanie dwóch wartości formularza pole po polu (obiekty płaskie i
 * zagnieżdżone, tablice, wartości proste). Służy ekranom do odpowiedzi na
 * pytanie „czy formularz różni się od stanu wyjściowego” — kolejność kluczy
 * nie ma znaczenia.
 */
export function rowneWartosci(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const kluczeA = Object.keys(a);
  const kluczeB = Object.keys(b);
  if (kluczeA.length !== kluczeB.length) return false;
  return kluczeA.every(
    (klucz) =>
      Object.prototype.hasOwnProperty.call(b, klucz) &&
      rowneWartosci((a as Record<string, unknown>)[klucz], (b as Record<string, unknown>)[klucz]),
  );
}
