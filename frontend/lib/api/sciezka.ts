/**
 * Budowa ścieżki żądania do `api()` z wartości, które nie są stałe w kodzie
 * (parametr trasy, wartość z adresu strony, pole formularza).
 *
 * Wartość wklejona do ścieżki szablonem bez kodowania może ją przestawić:
 * `?` albo `#` w segmencie zamienia resztę ścieżki w zapytanie albo fragment, a
 * `/` dokłada segmenty. Tę klasę zamyka dopiero kodowanie w miejscu, w którym
 * ścieżka powstaje — kontrola w kliencie (`adresApi`) widzi już gotowy napis i
 * nie odróżni `/lessons/7?/complete` od zamierzonej ścieżki z zapytaniem.
 *
 * Kodowanie nie czyni z `..` bezpiecznej wartości (`encodeURIComponent("..")`
 * to nadal `..`) — ten segment odrzuca kontrola w kliencie, więc oba kroki
 * działają razem.
 */

/**
 * Znacznikowy szablon: każda wstawiana wartość przechodzi przez
 * `encodeURIComponent`, stałe części zostają bez zmian.
 *
 * ```ts
 * api(sciezka`/lessons/${id}/complete`, { method: "POST" });
 * ```
 *
 * Wartość z ukośnikami (np. numer certyfikatu) wstawia się segment po
 * segmencie — jeden `${…}` na segment — bo zakodowany ukośnik klient odrzuca.
 */
export function sciezka(czesci: TemplateStringsArray, ...wartosci: ReadonlyArray<string | number>): string {
  let wynik = czesci[0];
  wartosci.forEach((wartosc, indeks) => {
    wynik += encodeURIComponent(String(wartosc)) + czesci[indeks + 1];
  });
  return wynik;
}

/**
 * Zapytanie (`?a=1&b=x`) zbudowane przez `URLSearchParams`; pominięte są
 * wartości `undefined` i `null`, a pusty zbiór daje pusty napis (bez `?`).
 */
export function zapytanie(parametry: Record<string, string | number | boolean | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [klucz, wartosc] of Object.entries(parametry)) {
    if (wartosc === undefined || wartosc === null) continue;
    params.append(klucz, String(wartosc));
  }
  const tekst = params.toString();
  return tekst === "" ? "" : `?${tekst}`;
}
