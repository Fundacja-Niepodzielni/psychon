/**
 * Tryb podglądu: personel i prowadzący oglądają kurs tak, jak go widzi
 * uczestnik. Sygnałem jest parametr adresu `podglad` o wartości 1 ORAZ rola konta —
 * sam parametr uczestnikowi niczego nie włącza. Moduł jest czysty (bez
 * odczytów i zapisów); rolę ekran bierze z odczytu konta, który ramka ma już
 * na stronie.
 */

/** Nazwa parametru adresu. */
export const PARAMETR_PODGLADU = "podglad";

/** Wartość parametru, która włącza podgląd. Każda inna znaczy „bez podglądu”. */
export const WARTOSC_PODGLADU = "1";

/** Role personelu: `project_manager` i `super_admin`. */
export const ROLE_PERSONELU = ["project_manager", "super_admin"] as const;

/** Rola prowadzącego. */
export const ROLA_PROWADZACEGO = "instructor";

/** Role, którym wolno oglądać kurs w podglądzie: personel i prowadzący. */
export const ROLE_PODGLADU: readonly string[] = [...ROLE_PERSONELU, ROLA_PROWADZACEGO];

/** Wartość parametru tak, jak ją oddaje adres: tekst, powtórzony parametr (lista) albo brak. */
export type WartoscParametru = string | readonly string[] | null | undefined;

/**
 * Czy ekran ma pokazać tryb podglądu: parametr `podglad` (dokładnie wartość `1`;
 * przy powtórzonym parametrze liczy się pierwszy) i rola personelu albo
 * prowadzącego. Rola nieznana (jeszcze nieodczytana) albo uczestnika daje
 * `false` — pas się nie pokazuje, ekran jest zwykły.
 */
export function czyTrybPodgladu(parametr: WartoscParametru, rola: string | null | undefined): boolean {
  const wartosc = typeof parametr === "string" ? parametr : (parametr?.[0] ?? null);
  return wartosc === WARTOSC_PODGLADU && typeof rola === "string" && ROLE_PODGLADU.includes(rola);
}

/**
 * Dopisuje parametr podglądu do adresu wewnętrznego (zaczynającego się od
 * jednego `/`), zachowując pozostałe parametry i fragment `#…`. Gdy podgląd
 * jest wyłączony albo adres nie jest wewnętrzny (inny schemat, `//host`),
 * zwraca adres bez zmian. Parametr już obecny w adresie jest zastępowany,
 * nie dublowany.
 */
export function zParametremPodgladu(adres: string, podglad: boolean): string {
  if (!podglad || !adres.startsWith("/") || adres.startsWith("//")) return adres;
  const hash = adres.indexOf("#");
  const bezFragmentu = hash === -1 ? adres : adres.slice(0, hash);
  const fragment = hash === -1 ? "" : adres.slice(hash);
  const zapytanie = bezFragmentu.indexOf("?");
  const sciezka = zapytanie === -1 ? bezFragmentu : bezFragmentu.slice(0, zapytanie);
  const parametry = new URLSearchParams(zapytanie === -1 ? "" : bezFragmentu.slice(zapytanie + 1));
  parametry.set(PARAMETR_PODGLADU, WARTOSC_PODGLADU);
  return `${sciezka}?${parametry.toString()}${fragment}`;
}

/**
 * Adres powrotu „Wróć do edycji kursu” według roli: personel — ekran kursu
 * administracji (`/admin/kursy/{id}`), prowadzący — jego ekran kursu
 * (`/prowadzacy/kursy/{id}`). Dla innej roli albo bez roli — `null` (pas bez
 * odnośnika powrotu się nie rysuje, bo i tak nie powstaje).
 */
export function adresPowrotuZPodgladu(rola: string | null | undefined, kursId: number | string): string | null {
  if (typeof rola !== "string") return null;
  if ((ROLE_PERSONELU as readonly string[]).includes(rola)) return `/admin/kursy/${kursId}`;
  if (rola === ROLA_PROWADZACEGO) return `/prowadzacy/kursy/${kursId}`;
  return null;
}
