/**
 * Adres lekcji uczestnika i kurs, z którego lekcja została otwarta.
 *
 * Odczyt lekcji (`GET /lessons/{id}`) nie niesie kursu, a pliki do pobrania są
 * tylko w odczycie kursu (`GET /courses/{slug}`). Dlatego link do lekcji w nowym
 * froncie dopisuje `?kurs=<slug>`, a ekran lekcji bierze kurs wyłącznie stąd.
 */

/** Kształt sluga kursu, jaki przyjmuje ekran lekcji; inny napis to brak kursu. */
const KSZTALT_SLUGA = /^[a-z0-9-]+$/;

/** Slug kursu z parametru adresu albo `null`, gdy parametru brak lub ma zły kształt. */
export function kursZAdresu(parametr: string | null | undefined): string | null {
  if (typeof parametr !== "string") return null;
  return KSZTALT_SLUGA.test(parametr) ? parametr : null;
}

/** Adres lekcji w panelu uczestnika; z parametrem kursu tylko wtedy, gdy slug ma poprawny kształt. */
export function adresLekcji(idLekcji: number | string, slugKursu?: string | null): string {
  const adres = `/panel/lekcje/${idLekcji}`;
  const kurs = kursZAdresu(slugKursu);
  return kurs === null ? adres : `${adres}?kurs=${kurs}`;
}
