import { api, apiPaged, ApiError, NieprawidlowaSciezkaApi } from "@/lib/api/klient";
import { sciezka } from "@/lib/api/sciezka";

/**
 * Odczyty i zapis ekranu testu końcowego uczestnika — te same trasy i te same
 * pola co dotychczasowy ekran `panel/kursy/[slug]/test`:
 *  - `GET /courses/{slug}/test` — `test_id`, `pass_threshold`, `attempts_used`,
 *    `attempts_limit` (limit z ustawień edycji albo nadpisanie kursu — liczy go
 *    zaplecze, ekran go nie zakłada), `passed` (test już zaliczony) i
 *    `questions` (`id`, `body`, `answers` z `id` i `body`, bez flag
 *    poprawności); dotychczasowy ekran pola `passed` nie czytał;
 *  - `GET /tests/{id}/attempts` — historia własnych podejść (`attempt_number`,
 *    `score_percent`, `passed`, `created_at`); historia jest pomocnicza, jej
 *    brak niczego nie blokuje;
 *  - `POST /tests/{id}/attempts` `{ answers: { [id pytania]: id odpowiedzi } }`
 *    — wynik podejścia (`attempt_number`, `score_percent`, `passed`,
 *    `wrong_question_ids`).
 *
 * Ponadto `GET /courses/{slug}` — ta sama trasa, którą czytają ekran kursu
 * i ekran lekcji — tylko po nazwę kursu w nagłówku, identyfikator kursu (powrót
 * z podglądu), `has_test` (kurs bez testu końcowego) i liczbę nieukończonych
 * lekcji. Jej niepowodzenie nie zatrzymuje ekranu: nagłówek jest wtedy bez nazwy.
 */

export interface OdpowiedzPytania {
  id: number;
  body: string;
}

export interface PytanieTestu {
  id: number;
  body: string;
  answers: OdpowiedzPytania[];
}

export interface DaneTestu {
  test_id: number;
  pass_threshold: number;
  attempts_used: number;
  attempts_limit: number;
  /**
   * Czy osoba ma już zaliczone podejście (`TestController::show`, to samo
   * źródło zaliczenia co ścieżka kursów). Zaliczony test nie daje „Rozpocznij”.
   */
  passed: boolean;
  questions: PytanieTestu[];
}

export interface WynikPodejscia {
  attempt_number: number;
  score_percent: number;
  passed: boolean;
  wrong_question_ids: number[];
}

export interface PodejscieZHistorii {
  attempt_number: number;
  score_percent: number;
  passed: boolean;
  created_at: string | null;
}

/** Tyle, ile ekran testu bierze z odczytu kursu. */
export interface KursTestu {
  id: number;
  title: string;
  /** `false` tylko wtedy, gdy zaplecze powie to wprost; brak pola to „nie wiadomo”. */
  has_test: boolean | null;
  /** Liczba nieukończonych lekcji kursu. */
  nieukonczone: number;
}

/** Adres strony kursu uczestnika — cel „Wróć do kursu”. */
export function adresKursu(slug: string): string {
  return `/panel/kursy/${slug}`;
}

/** Adres listy kursów uczestnika — cel powrotu, gdy kursu nie ma. */
export const ADRES_LISTY_KURSOW = "/panel/kursy";

export function pobierzTest(slug: string): Promise<DaneTestu> {
  return api<DaneTestu>(sciezka`/courses/${slug}/test`);
}

/** Historia podejść albo `null`, gdy odczyt się nie udał (historia jest pomocnicza). */
export async function pobierzHistorie(idTestu: number): Promise<PodejscieZHistorii[] | null> {
  try {
    const strona = await apiPaged<PodejscieZHistorii>(sciezka`/tests/${idTestu}/attempts`);
    return Array.isArray(strona.data) ? strona.data : [];
  } catch {
    return null;
  }
}

/** Zapis podejścia; wyjątek leci do wołającego (`sklasyfikujBladWyslania`). */
export function wyslijPodejscie(idTestu: number, odpowiedzi: Record<number, number>): Promise<WynikPodejscia> {
  return api<WynikPodejscia>(sciezka`/tests/${idTestu}/attempts`, { method: "POST", body: { answers: odpowiedzi } });
}

interface OdczytKursu {
  id?: unknown;
  title?: unknown;
  has_test?: unknown;
  lessons?: unknown;
}

/**
 * Nazwa i stan kursu albo `null`: kursu nie ma (404), odczyt się nie udał albo
 * odpowiedź nie niesie tytułu. Wynik `"nie-znaleziono"` odróżnia kurs, którego
 * nie ma, od chwilowego błędu.
 */
export async function pobierzKursTestu(slug: string): Promise<KursTestu | "nie-znaleziono" | null> {
  let kurs: OdczytKursu | null;
  try {
    kurs = await api<OdczytKursu | null>(sciezka`/courses/${slug}`);
  } catch (wyjatek) {
    if (wyjatek instanceof NieprawidlowaSciezkaApi) return "nie-znaleziono";
    if (wyjatek instanceof ApiError && wyjatek.status === 404) return "nie-znaleziono";
    return null;
  }
  if (kurs === null || typeof kurs !== "object" || typeof kurs.title !== "string" || typeof kurs.id !== "number") return null;
  const lekcje = Array.isArray(kurs.lessons) ? (kurs.lessons as { is_completed?: unknown }[]) : [];
  return {
    id: kurs.id,
    title: kurs.title,
    has_test: typeof kurs.has_test === "boolean" ? kurs.has_test : null,
    nieukonczone: lekcje.filter((lekcja) => lekcja?.is_completed !== true).length,
  };
}

/** Stany ekranu bez danych testu. */
export type BladTestu =
  | { rodzaj: "lekcje-nieukonczone" }
  | { rodzaj: "kurs-zamkniety"; komunikat: string }
  | { rodzaj: "brak-dostepu"; komunikat: string }
  | { rodzaj: "dostep-wygasl" }
  | { rodzaj: "nie-znaleziono" }
  | { rodzaj: "siec" }
  | { rodzaj: "blad" };

/**
 * Klasyfikacja błędu odczytu testu (kody z `TestController::show`):
 *  - 422 `conditions_not_met` z `reason.missing` zawierającym `lessons` →
 *    test zamknięty, dopóki nie wszystkie lekcje kursu są ukończone;
 *  - 403 `course_locked` → kurs zamknięty kolejnością ścieżki (zdanie serwera);
 *  - 403 `access_expired` → dostęp wygasł (klient API sam przenosi na ekran
 *    „Dostęp wygasł”);
 *  - inne 403 → brak dostępu (zdanie serwera);
 *  - 404 → nie ma kursu albo kurs nie ma testu (zaplecze odpowiada tak samo;
 *    rozróżnia to dopiero `has_test` z odczytu kursu);
 *  - wyjątek bez odpowiedzi → brak połączenia; każda inna odpowiedź → błąd.
 */
export function sklasyfikujBladTestu(wyjatek: unknown): BladTestu {
  if (wyjatek instanceof NieprawidlowaSciezkaApi) return { rodzaj: "nie-znaleziono" };
  if (!(wyjatek instanceof ApiError)) return { rodzaj: "siec" };
  if (czyLekcjeNieukonczone(wyjatek)) return { rodzaj: "lekcje-nieukonczone" };
  if (wyjatek.status === 403 && wyjatek.code === "course_locked") return { rodzaj: "kurs-zamkniety", komunikat: wyjatek.message };
  if (wyjatek.status === 403 && wyjatek.code === "access_expired") return { rodzaj: "dostep-wygasl" };
  if (wyjatek.status === 403) return { rodzaj: "brak-dostepu", komunikat: wyjatek.message };
  if (wyjatek.status === 404) return { rodzaj: "nie-znaleziono" };
  return { rodzaj: "blad" };
}

function czyLekcjeNieukonczone(wyjatek: ApiError): boolean {
  if (wyjatek.status !== 422 || wyjatek.code !== "conditions_not_met") return false;
  const brakuje = wyjatek.reason?.missing;
  return Array.isArray(brakuje) && brakuje.includes("lessons");
}

/** Co ekran robi z nieudanym wysłaniem podejścia. */
export type BladWyslania =
  | { rodzaj: "brak-podejsc"; komunikat: string }
  | { rodzaj: "zaliczony" }
  | { rodzaj: "lekcje-nieukonczone" }
  | { rodzaj: "komunikat"; komunikat: string };

export const ZDANIE_BLEDU_WYSLANIA = "Nie udało się wysłać odpowiedzi. Sprawdź internet i spróbuj ponownie.";

/**
 * Klasyfikacja błędu `POST /tests/{id}/attempts`: 403 `attempts_exhausted` →
 * podejścia się skończyły (zdanie serwera); 403 `test_already_passed` → test
 * jest już zaliczony (np. w drugiej karcie) — ekran wczytuje go od nowa;
 * 422 `conditions_not_met` → test zamknięty lekcjami; inna odpowiedź serwera →
 * jej zdanie; brak odpowiedzi → zdanie o internecie. Odpowiedzi zaznaczone na
 * ekranie zostają.
 */
export function sklasyfikujBladWyslania(wyjatek: unknown): BladWyslania {
  if (!(wyjatek instanceof ApiError)) return { rodzaj: "komunikat", komunikat: ZDANIE_BLEDU_WYSLANIA };
  if (wyjatek.status === 403 && wyjatek.code === "attempts_exhausted") return { rodzaj: "brak-podejsc", komunikat: wyjatek.message };
  if (wyjatek.status === 403 && wyjatek.code === "test_already_passed") return { rodzaj: "zaliczony" };
  if (czyLekcjeNieukonczone(wyjatek)) return { rodzaj: "lekcje-nieukonczone" };
  return { rodzaj: "komunikat", komunikat: wyjatek.message || ZDANIE_BLEDU_WYSLANIA };
}
