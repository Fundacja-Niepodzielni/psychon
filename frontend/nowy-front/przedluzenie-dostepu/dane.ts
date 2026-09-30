import { api, ApiError } from "@/lib/api/klient";
import { zdanieOdmowyRoli } from "@/design-system/molekuly/EmptyState/EmptyState";
import type { AdminUserCard } from "@/lib/api/h18";

/**
 * Logika danych ekranu „Przedłużenie dostępu”: ciało żądania, kontrola pól,
 * data po przedłużeniu, mapowanie błędów serwera. Bez Reacta, żeby dało się
 * ją sprawdzić samym testem jednostkowym.
 *
 * Trasa: `POST /admin/users/{id}/extend-access` z dokładnie jednym z pól:
 * `months` (liczba całkowita 1–60) albo `until` (data). Obecną datę czyta
 * karta osoby (`GET /admin/users/{id}`, `profile.access_expires_at`).
 * Zdarzenie w dzienniku działań zapisuje serwer — ekran nic tam nie wysyła.
 */
export type TrybPrzedluzenia = "months" | "until";

export const MIESIACE_MIN = 1;
export const MIESIACE_MAX = 60;
export const MIESIACE_DOMYSLNE = "6";

export type CialoPrzedluzenia = { months: number } | { until: string };

export interface BledyPol {
  months?: string;
  until?: string;
}

/** Osoba po przedłużeniu — zasób użytkownika bez pola potwierdzenia aktywacji. */
export interface OsobaPoPrzedluzeniu {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  roles: string[];
  access_expires_at: string | null;
  program_completed_at: string | null;
}

export function pobierzKarteOsoby(idOsoby: number): Promise<AdminUserCard> {
  return api<AdminUserCard>(`/admin/users/${idOsoby}`);
}

export function przedluzDostep(idOsoby: number, cialo: CialoPrzedluzenia): Promise<OsobaPoPrzedluzeniu> {
  return api<OsobaPoPrzedluzeniu>(`/admin/users/${idOsoby}/extend-access`, { method: "POST", body: cialo });
}

function dataKalendarzowa(tekst: string): Date | null {
  const trafienie = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tekst);
  if (!trafienie) return null;
  const [rok, miesiac, dzien] = [Number(trafienie[1]), Number(trafienie[2]), Number(trafienie[3])];
  const data = new Date(Date.UTC(rok, miesiac - 1, dzien));
  const zgodna = data.getUTCFullYear() === rok && data.getUTCMonth() === miesiac - 1 && data.getUTCDate() === dzien;
  return zgodna ? data : null;
}

function liczbaMiesiecy(tekst: string): number | null {
  const czyste = tekst.trim();
  if (!/^\d+$/.test(czyste)) return null;
  const liczba = Number(czyste);
  return liczba >= MIESIACE_MIN && liczba <= MIESIACE_MAX ? liczba : null;
}

/** Kontrola pola przed wysłaniem — te same granice co reguły serwera. */
export function zbudujCialo(
  tryb: TrybPrzedluzenia,
  miesiace: string,
  data: string,
): { cialo: CialoPrzedluzenia } | { bledy: BledyPol } {
  if (tryb === "months") {
    if (miesiace.trim() === "") return { bledy: { months: "Podaj liczbę miesięcy." } };
    const liczba = liczbaMiesiecy(miesiace);
    if (liczba === null) {
      return { bledy: { months: `Liczba miesięcy musi być całkowita, od ${MIESIACE_MIN} do ${MIESIACE_MAX}.` } };
    }
    return { cialo: { months: liczba } };
  }
  if (data.trim() === "") return { bledy: { until: "Wybierz datę." } };
  if (dataKalendarzowa(data.trim()) === null) return { bledy: { until: "Podaj poprawną datę." } };
  return { cialo: { until: data.trim() } };
}

/** Dodaje miesiące kalendarzowe tak jak serwer (nadmiar dnia przechodzi na następny miesiąc). */
function dodajMiesiace(baza: Date, miesiace: number): Date {
  const wynik = new Date(baza.getTime());
  wynik.setUTCMonth(wynik.getUTCMonth() + miesiace);
  return wynik;
}

/**
 * Data po przedłużeniu, liczona tak jak na serwerze: miesiące od obecnej daty,
 * jeśli jest jeszcze w przyszłości, w przeciwnym razie od teraz; data wprost
 * ustawia się bez zmian. `null`, gdy pola nie da się jeszcze policzyć.
 */
export function dataPoPrzedluzeniu(
  obecna: string | null,
  tryb: TrybPrzedluzenia,
  miesiace: string,
  data: string,
  teraz: Date,
): Date | null {
  if (tryb === "until") return dataKalendarzowa(data.trim());
  const liczba = liczbaMiesiecy(miesiace);
  if (liczba === null) return null;
  const obecnaData = obecna === null ? null : new Date(obecna);
  const baza = obecnaData !== null && !Number.isNaN(obecnaData.getTime()) && obecnaData > teraz ? obecnaData : teraz;
  return dodajMiesiace(baza, liczba);
}

const FORMAT_DATY = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Warsaw",
});

export function formatujDate(data: Date | string | null): string {
  if (data === null) return "—";
  const wartosc = typeof data === "string" ? new Date(data) : data;
  return Number.isNaN(wartosc.getTime()) ? "—" : FORMAT_DATY.format(wartosc);
}

/** Czy data po przedłużeniu jest wcześniejsza niż obecna (skrócenie dostępu). */
export function czySkraca(obecna: string | null, nowa: Date | null): boolean {
  if (obecna === null || nowa === null) return false;
  const obecnaData = new Date(obecna);
  return !Number.isNaN(obecnaData.getTime()) && nowa < obecnaData;
}

export type StanKarty =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "nie-znaleziono" }
  | { rodzaj: "siec" }
  | { rodzaj: "gotowy"; karta: AdminUserCard };

/** Błąd wczytania karty → stan ekranu (401/403 odmowa, 404 brak osoby, reszta sieć). */
export function stanZBleduKarty(blad: unknown): StanKarty {
  if (blad instanceof ApiError) {
    if (blad.status === 401 || blad.status === 403) return { rodzaj: "brak-uprawnien" };
    if (blad.status === 404) return { rodzaj: "nie-znaleziono" };
  }
  return { rodzaj: "siec" };
}

export type WynikBleduZapisu =
  | { rodzaj: "pola"; bledy: BledyPol }
  | { rodzaj: "ogolny"; tresc: string };

/** Błąd zapisu → błędy pól (422) albo jedno zdanie nad formularzem. */
export function wynikZBleduZapisu(blad: unknown): WynikBleduZapisu {
  if (blad instanceof ApiError) {
    if (blad.status === 422) {
      const bledy: BledyPol = {};
      const miesiace = blad.errors?.months?.[0];
      const data = blad.errors?.until?.[0];
      if (miesiace) bledy.months = miesiace;
      if (data) bledy.until = data;
      if (bledy.months || bledy.until) return { rodzaj: "pola", bledy };
      return { rodzaj: "ogolny", tresc: "Popraw dane przedłużenia i spróbuj ponownie." };
    }
    if (blad.status === 401 || blad.status === 403) {
      return { rodzaj: "ogolny", tresc: zdanieOdmowyRoli("administracji") };
    }
    if (blad.status === 404) {
      return { rodzaj: "ogolny", tresc: "Nie znaleziono osoby. Dostęp nie został zmieniony." };
    }
  }
  return { rodzaj: "ogolny", tresc: "Nie udało się przedłużyć dostępu. Dostęp nie został zmieniony — spróbuj ponownie." };
}

/** Identyfikator z adresu; trasa serwera przyjmuje wyłącznie liczby. */
export function idOsobyZAdresu(tekst: string): number | null {
  return /^\d+$/.test(tekst) ? Number(tekst) : null;
}
