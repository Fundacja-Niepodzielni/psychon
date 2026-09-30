import { ApiError, type PaginationMeta } from "@/lib/api/klient";
import type { WierszRecordList } from "@/design-system/organizmy/RecordList/RecordList";
import type { PytanieSkrzynki, StronaPytan } from "./dane";

/**
 * Logika ekranu „Skrzynka pytań” bez Reacta: klasyfikacja błędów serwera,
 * wiersze listy, licznik bez odpowiedzi i zdjęcie pytania po odpowiedzi.
 */

export type RodzajBledu =
  /** 401 albo 403 `forbidden` — inna rola niż prowadzący. */
  | "brak-uprawnien"
  /** 404 — pytanie cudze albo nieistniejące (serwer nie rozróżnia). */
  | "nie-znaleziono"
  /** 403 `entry_locked` — na pytanie odpowiedziano już wcześniej. */
  | "juz-odpowiedziano"
  /** 422 z polami. */
  | "pola"
  /** Pozostałe: brak połączenia, 5xx, nieznany kod. */
  | "inny";

export function rodzajBledu(blad: unknown): RodzajBledu {
  if (!(blad instanceof ApiError)) return "inny";
  if (blad.status === 401) return "brak-uprawnien";
  if (blad.status === 403 && blad.code === "forbidden") return "brak-uprawnien";
  if (blad.status === 403 && blad.code === "entry_locked") return "juz-odpowiedziano";
  if (blad.status === 404) return "nie-znaleziono";
  if (blad.status === 422) return "pola";
  return "inny";
}

/** Pierwszy komunikat błędu pola `answer` z koperty 422 albo `undefined`. */
export function bladPolaOdpowiedzi(blad: unknown): string | undefined {
  return blad instanceof ApiError ? blad.errors?.answer?.[0] : undefined;
}

/** Liczba pytań bez odpowiedzi w całej skrzynce (`meta.extra.unanswered`), a bez niej — liczba na liście. */
export function liczbaBezOdpowiedzi(strona: StronaPytan): number {
  const wartosc = strona.meta?.extra?.unanswered;
  return typeof wartosc === "number" ? wartosc : (strona.meta?.total ?? strona.data.length);
}

export function odmianaPytan(liczba: number): string {
  if (liczba === 1) return "pytanie";
  const reszta10 = liczba % 10;
  const reszta100 = liczba % 100;
  if (reszta10 >= 2 && reszta10 <= 4 && !(reszta100 >= 12 && reszta100 <= 14)) return "pytania";
  return "pytań";
}

export function opisLicznika(liczba: number): string {
  return `${liczba} ${odmianaPytan(liczba)} bez odpowiedzi`;
}

/** Data i godzina pytania, czas polski, bez sekund. */
export function formatujDate(iso: string | null): string {
  if (iso === null) return "brak daty";
  return new Date(iso).toLocaleString("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Kto, z jakiego kursu i lekcji, kiedy — jedna linia pod treścią pytania. */
export function opisPytania(pytanie: PytanieSkrzynki): string {
  const autor = `${pytanie.user.first_name} ${pytanie.user.last_name}`.trim();
  return [autor, pytanie.lesson.course.title, pytanie.lesson.title, formatujDate(pytanie.created_at)].join(" · ");
}

/** Wiersze `RecordList`: treść pytania jako tekst, akcja „Odpowiedz”. */
export function wierszePytan(pytania: PytanieSkrzynki[], naOdpowiedz: (pytanie: PytanieSkrzynki) => void): WierszRecordList[] {
  return pytania.map((pytanie) => ({
    id: String(pytanie.id),
    tytul: pytanie.question,
    podpowiedz: opisPytania(pytanie),
    akcja: { etykieta: "Odpowiedz", onKliknij: () => naOdpowiedz(pytanie) },
  }));
}

function pomniejsz(meta: PaginationMeta | undefined): PaginationMeta | undefined {
  if (meta === undefined) return undefined;
  const nieodpowiedziane = meta.extra?.unanswered;
  return {
    ...meta,
    total: Math.max(meta.total - 1, 0),
    extra:
      typeof nieodpowiedziane === "number"
        ? { ...meta.extra, unanswered: Math.max(nieodpowiedziane - 1, 0) }
        : meta.extra,
  };
}

/** Strona bez pytania, na które właśnie odpowiedziano; licznik i suma maleją o jeden. */
export function zdejmijPytanie(strona: StronaPytan, idPytania: number): StronaPytan {
  if (!strona.data.some((pytanie) => pytanie.id === idPytania)) return strona;
  return { data: strona.data.filter((pytanie) => pytanie.id !== idPytania), meta: pomniejsz(strona.meta) };
}

/**
 * Strona do ponownego wczytania, gdy po zdjęciu pytania bieżąca strona jest
 * pusta, a w skrzynce coś zostało; `null`, gdy nic nie trzeba wczytywać.
 */
export function stronaDoWczytania(strona: StronaPytan, numer: number): number | null {
  if (strona.data.length > 0 || strona.meta === undefined || strona.meta.total === 0) return null;
  const ostatnia = Math.max(Math.ceil(strona.meta.total / Math.max(strona.meta.per_page, 1)), 1);
  return Math.min(numer, ostatnia);
}
