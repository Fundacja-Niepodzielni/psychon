import { ApiError, type PaginationMeta } from "@/lib/api/klient";
import type { WierszRecordList } from "@/design-system/organizmy/RecordList/RecordList";
import type { PytanieSkrzynki, StronaPytan, WidokPytan } from "./dane";

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

/** Opcje filtra widoku — etykiety jak na poprzedniej stronie. */
export const OPCJE_WIDOKU: { wartosc: WidokPytan; etykieta: string }[] = [
  { wartosc: "bez-odpowiedzi", etykieta: "Tylko nieodpowiedziane" },
  { wartosc: "wszystkie", etykieta: "Pokaż wszystkie" },
];

/** Tytuł listy i osobny stan pusty dla każdego widoku. */
export function tekstPustegoStanu(widok: WidokPytan): { tytulListy: string; naglowek: string; tresc: string } {
  if (widok === "wszystkie") {
    return {
      tytulListy: "Wszystkie pytania",
      naglowek: "Nie masz jeszcze żadnych pytań",
      tresc: "Gdy uczestnik zada pytanie przy lekcji Twojego kursu, pojawi się tutaj.",
    };
  }
  return {
    tytulListy: "Pytania bez odpowiedzi",
    naglowek: "Brak pytań bez odpowiedzi",
    tresc: "Gdy uczestnik zada nowe pytanie przy lekcji Twojego kursu, pojawi się tutaj.",
  };
}

/**
 * Wiersze `RecordList`: treść pytania jako tekst; bez odpowiedzi — plakietka
 * „Oczekuje” i akcja „Odpowiedz”, z odpowiedzią — plakietka „Odpowiedziane” i
 * akcja „Zobacz odpowiedź” (podgląd bez formularza).
 */
export function wierszePytan(
  pytania: PytanieSkrzynki[],
  naOdpowiedz: (pytanie: PytanieSkrzynki) => void,
  naPodglad: (pytanie: PytanieSkrzynki) => void,
): WierszRecordList[] {
  return pytania.map((pytanie) => {
    const odpowiedziane = pytanie.answer !== null;
    return {
      id: String(pytanie.id),
      tytul: pytanie.question,
      podpowiedz: opisPytania(pytanie),
      plakietka: odpowiedziane
        ? { wariant: "ok", tekst: "Odpowiedziane" }
        : { wariant: "pending", tekst: "Oczekuje" },
      akcja: odpowiedziane
        ? { etykieta: "Zobacz odpowiedź", onKliknij: () => naPodglad(pytanie) }
        : { etykieta: "Odpowiedz", onKliknij: () => naOdpowiedz(pytanie) },
    };
  });
}

/**
 * Strona, na której pytanie zostaje i dostaje odpowiedź z serwera (widok
 * „Pokaż wszystkie”); licznik bez odpowiedzi maleje tylko wtedy, gdy pytanie
 * do tej pory nie miało odpowiedzi.
 */
export function zastapPytanie(strona: StronaPytan, odpowiedziane: PytanieSkrzynki): StronaPytan {
  const dotychczasowe = strona.data.find((pytanie) => pytanie.id === odpowiedziane.id);
  if (dotychczasowe === undefined) return strona;
  const meta = strona.meta;
  const nieodpowiedziane = meta?.extra?.unanswered;
  return {
    data: strona.data.map((pytanie) => (pytanie.id === odpowiedziane.id ? odpowiedziane : pytanie)),
    meta:
      meta === undefined || dotychczasowe.answer !== null || typeof nieodpowiedziane !== "number"
        ? meta
        : { ...meta, extra: { ...meta.extra, unanswered: Math.max(nieodpowiedziane - 1, 0) } },
  };
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
