import { ApiError, type PaginationMeta } from "@/lib/api/klient";
import {
  fetchAdminReliability,
  fetchAdminReliabilityDetail,
  type AdminReliabilityDetail,
  type AdminReliabilityPerson,
} from "@/lib/h07/api";
import { formatujDziesietny } from "@/nowy-front/wspolne/formatuj-dziesietny";
import { minutyZSekund } from "@/nowy-front/wspolne/minuty";

/**
 * Dane ekranu „Czas nauki” — `GET /admin/reliability?page=&per_page=25` (lista)
 * i `GET /admin/reliability/{userId}` (szczegóły osoby), obie przez dotychczasowe
 * funkcje odczytu (`lib/h07/api.ts`), więc żądania są takie same jak na starym
 * ekranie tej trasy. Trasa listy nie
 * przyjmuje żadnych innych parametrów (filtr ani własne sortowanie nie istnieją
 * po stronie serwera), a kolejność ustala serwer: od najniższej rzetelności,
 * osoby bez wyniku na końcu.
 */

export type { AdminReliabilityDetail, AdminReliabilityPerson };
export type { ReliabilityLesson } from "@/lib/h07/api";

export interface StronaOsob {
  data: AdminReliabilityPerson[];
  meta?: PaginationMeta;
}

export function pobierzOsoby(strona: number): Promise<StronaOsob> {
  return fetchAdminReliability(strona);
}

export function pobierzSzczegoly(osobaId: number): Promise<AdminReliabilityDetail> {
  return fetchAdminReliabilityDetail(osobaId);
}

/** Odmowa z powodu roli (401/403), błąd odpowiedzi serwera albo brak połączenia. */
export function rodzajBledu(wyjatek: unknown): "brak-uprawnien" | "blad" | "siec" {
  if (!(wyjatek instanceof ApiError)) return "siec";
  return wyjatek.status === 401 || wyjatek.status === 403 ? "brak-uprawnien" : "blad";
}

/** Zdanie pod tytułem błędu, gdy serwer nie podał własnego. */
export const KOMUNIKAT_BLEDU_SERWERA = "Serwer nie odpowiedział poprawnie. Spróbuj ponownie za chwilę.";

/** Zdanie serwera z koperty błędu (jak na starym ekranie) albo zdanie zastępcze, gdy serwer go nie podał. */
export function zdanieBledu(wyjatek: unknown): string {
  return wyjatek instanceof ApiError && wyjatek.message.trim() !== "" ? wyjatek.message : KOMUNIKAT_BLEDU_SERWERA;
}

/** Parametr adresu z widokiem osoby: `?osoba=<numer>` na tej samej stronie. */
export const PARAMETR_OSOBY = "osoba";

/** Numer osoby z parametru adresu; `null`, gdy parametru nie ma albo nie jest dodatnią liczbą całkowitą. */
export function numerOsobyZAdresu(wartosc: string | null): number | null {
  if (wartosc === null || !/^[1-9][0-9]*$/.test(wartosc)) return null;
  const numer = Number(wartosc);
  return Number.isSafeInteger(numer) ? numer : null;
}

export type BladSzczegolow =
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "nie-znaleziono" }
  | { rodzaj: "blad"; komunikat: string }
  | { rodzaj: "siec" };

/** Błąd odczytu szczegółów: osoby nie ma albo jest poza zakresem (404) to osobny stan. */
export function sklasyfikujBladSzczegolow(wyjatek: unknown): BladSzczegolow {
  if (!(wyjatek instanceof ApiError)) return { rodzaj: "siec" };
  if (wyjatek.status === 401 || wyjatek.status === 403) return { rodzaj: "brak-uprawnien" };
  if (wyjatek.status === 404) return { rodzaj: "nie-znaleziono" };
  return { rodzaj: "blad", komunikat: zdanieBledu(wyjatek) };
}

/**
 * Czas dla osoby: „godz.” i „min”. Serwer trzyma sekundy; przeliczenie idzie
 * wspólną funkcją minut (w górę do pełnej minuty, więc dodatni czas nigdy nie
 * pokazuje 0 min). Pełne godziny bez minut: „2 godz.”.
 */
export function formatujCzas(sekundy: number): string {
  const minuty = Number.isFinite(sekundy) ? minutyZSekund(sekundy) : 0;
  const godziny = Math.floor(minuty / 60);
  const reszta = minuty % 60;
  if (godziny === 0) return `${reszta} min`;
  return reszta === 0 ? `${godziny} godz.` : `${godziny} godz. ${reszta} min`;
}

/** Rzetelność jako „85%” albo myślnik, gdy osoba nie ma jeszcze wyniku. */
export function formatujRzetelnosc(procent: string | null): string {
  return procent === null ? "—" : `${formatujDziesietny(procent)}%`;
}

export type WariantStanu = "ok" | "error" | "neutral";

/** Stan słowami: poniżej progu, w normie albo brak danych (osoba bez mierzalnej lekcji). */
export function stanRzetelnosci(osoba: Pick<AdminReliabilityPerson, "reliability_percent" | "below_threshold">): {
  wariant: WariantStanu;
  tekst: string;
} {
  if (osoba.reliability_percent === null) return { wariant: "neutral", tekst: "brak danych" };
  return osoba.below_threshold ? { wariant: "error", tekst: "poniżej progu" } : { wariant: "ok", tekst: "w normie" };
}

export function stanLekcji(belowThreshold: boolean): { wariant: WariantStanu; tekst: string } {
  return belowThreshold ? { wariant: "error", tekst: "poniżej progu" } : { wariant: "ok", tekst: "w normie" };
}
