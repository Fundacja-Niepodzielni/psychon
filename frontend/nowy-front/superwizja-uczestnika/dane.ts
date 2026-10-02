import { api, apiPaged, ApiError, type PaginationMeta } from "@/lib/api/klient";
import { formatujDateICzas } from "../wspolne/daty";
import { odmien } from "../wspolne/odmiana";

/**
 * Dane ekranu „Superwizja” osoby wolontariackiej. Dokładnie te same trzy
 * żądania co stary ekran `components/h12/SupervisionSlots.tsx` (pomiar:
 * `./POMIAR-STAREGO-EKRANU.md`, trasy `backend/routes/api/h12.php:26-31`):
 *  - `GET    /supervision/slots?page=1&per_page=25` — terminy superwizora osoby,
 *  - `POST   /supervision/slots/{id}/signup`        — zapis, bez ciała,
 *  - `DELETE /supervision/slots/{id}/signup`        — wypis, bez ciała.
 * Zapis i wypis zwracają jeden termin w tym samym kształcie co lista
 * (`backend/app/Http/Resources/H12/SupervisionSlotResource.php`).
 *
 * Wołane z przeglądarki przez `lib/api/klient.ts` — token płynie z sesji,
 * tak samo jak na pozostałych ekranach nowego frontu.
 */

export type Obecnosc = "present" | "absent";

export interface ZapisNaTermin {
  signed_up_at: string | null;
  attendance: Obecnosc | null;
}

export interface TerminSuperwizji {
  id: number;
  /** Znacznik czasu UTC. */
  starts_at: string;
  duration_minutes: number;
  seats_limit: number;
  location_or_link: string | null;
  active_signups_count: number;
  available_seats: number;
  is_full: boolean;
  /** Serwer liczy je tym samym warunkiem, którym odmawia zapisu i wypisu: termin jeszcze się nie rozpoczął. */
  can_sign_up: boolean;
  signup: ZapisNaTermin | null;
}

export interface ListaTerminow {
  terminy: TerminSuperwizji[];
  meta: PaginationMeta | undefined;
}

/** Stary ekran prosi zawsze o pierwszą stronę po 25 terminów — nowy tak samo. */
export const SCIEZKA_LISTY = "/supervision/slots?page=1&per_page=25";

export async function pobierzTerminy(): Promise<ListaTerminow> {
  const { data, meta } = await apiPaged<TerminSuperwizji>(SCIEZKA_LISTY);
  return { terminy: data, meta };
}

export function zapiszNaTermin(id: number): Promise<TerminSuperwizji> {
  return api<TerminSuperwizji>(`/supervision/slots/${id}/signup`, { method: "POST" });
}

export function wypiszZTerminu(id: number): Promise<TerminSuperwizji> {
  return api<TerminSuperwizji>(`/supervision/slots/${id}/signup`, { method: "DELETE" });
}

/** Trzy części ekranu, w kolejności z serwera (od najwcześniejszego terminu). */
export interface PodzialTerminow {
  /** Terminy z zapisem osoby — przyszłe i minione (z obecnością). */
  twoje: TerminSuperwizji[];
  /** Terminy przed rozpoczęciem, bez zapisu osoby — z wolnymi miejscami albo pełne. */
  wolne: TerminSuperwizji[];
  /** Terminy, które już się rozpoczęły, bez zapisu osoby. */
  minione: TerminSuperwizji[];
}

export function podzielTerminy(terminy: TerminSuperwizji[]): PodzialTerminow {
  return {
    twoje: terminy.filter((termin) => termin.signup !== null),
    wolne: terminy.filter((termin) => termin.signup === null && termin.can_sign_up),
    minione: terminy.filter((termin) => termin.signup === null && !termin.can_sign_up),
  };
}

/** Czy na termin można się teraz zapisać: przed rozpoczęciem, bez zapisu, z wolnym miejscem. */
export function czyMoznaSieZapisac(termin: TerminSuperwizji): boolean {
  return termin.signup === null && termin.can_sign_up && !termin.is_full;
}

/**
 * Plakietki terminu — przy wolnych i pełnych terminach te same słowa, którymi
 * ekran terminów superwizji w administracji (`nowy-front/superwizje-terminy`)
 * mówi o tym samym terminie: „Wolne miejsca” i „Brak wolnych miejsc”.
 */
export type Plakietka = { tekst: string; wariant: "neutral" | "ok" | "warn" | "error" | "pending" };

export const PLAKIETKI = {
  wolneMiejsca: { tekst: "Wolne miejsca", wariant: "neutral" },
  brakMiejsc: { tekst: "Brak wolnych miejsc", wariant: "warn" },
  zapisano: { tekst: "Zapisano Cię", wariant: "ok" },
  odbylSie: { tekst: "Termin już się odbył", wariant: "neutral" },
} as const satisfies Record<string, Plakietka>;

/**
 * Obecność na minionym terminie z zapisem — te same słowa, którymi
 * dotychczasowy ekran terminów w administracji nazywa obecność; brak wpisu
 * nazwany wprost, żeby nie wyglądał jak nieobecność.
 */
export const OBECNOSC: Record<Obecnosc | "brak", Plakietka> = {
  present: { tekst: "Obecność potwierdzona", wariant: "ok" },
  absent: { tekst: "Nieobecność", wariant: "warn" },
  brak: { tekst: "Obecność jeszcze nieoznaczona", wariant: "pending" },
};

export function plakietkaTerminu(termin: TerminSuperwizji): Plakietka {
  if (termin.signup !== null) {
    return termin.can_sign_up ? PLAKIETKI.zapisano : OBECNOSC[termin.signup.attendance ?? "brak"];
  }
  if (!termin.can_sign_up) return PLAKIETKI.odbylSie;
  return termin.is_full ? PLAKIETKI.brakMiejsc : PLAKIETKI.wolneMiejsca;
}

/** „3 października 2026, 14:00” — wspólny formater, nigdy zapis techniczny. */
export function nazwaTerminu(termin: TerminSuperwizji): string {
  return formatujDateICzas(termin.starts_at);
}

/** „60 minut”, „1 minuta”, „45 minut”, „2 minuty”. */
export function tekstMinut(minuty: number): string {
  return `${minuty} ${odmien(minuty, "minuta", "minuty", "minut")}`;
}

/** „1 termin”, „3 terminy”, „12 terminów”. */
export function tekstTerminow(liczba: number): string {
  return `${liczba} ${odmien(liczba, "termin", "terminy", "terminów")}`;
}

/** „1 wolne miejsce”, „3 wolne miejsca”, „5 wolnych miejsc”. */
export function tekstWolnychMiejsc(liczba: number): string {
  return `${liczba} ${odmien(liczba, "wolne miejsce", "wolne miejsca", "wolnych miejsc")}`;
}

/** Zajęte miejsca względem limitu: „4 z 6”. */
export function tekstZajetych(termin: TerminSuperwizji): string {
  return `${termin.active_signups_count} z ${termin.seats_limit}`;
}

/** Odnośnik do spotkania tylko dla adresów `http:` i `https:`; każdy inny zapis zostaje tekstem. */
export function adresSpotkania(miejsce: string | null): string | null {
  if (miejsce === null) return null;
  const tekst = miejsce.trim();
  return /^https?:\/\/\S+$/i.test(tekst) ? tekst : null;
}

/**
 * Zdanie przy wyłączonym przycisku — powód, dla którego akcji nie ma, albo
 * `null`, gdy przycisk działa. Ta sama reguła co na starym ekranie: przycisk
 * jest wyłączony, gdy termin się rozpoczął (`can_sign_up`) albo — przy zapisie —
 * gdy termin jest pełny.
 */
export function powodBlokady(termin: TerminSuperwizji): string | null {
  if (!termin.can_sign_up) {
    return termin.signup === null
      ? "Termin już się rozpoczął — zapis nie jest już możliwy."
      : "Termin już się rozpoczął — wypis nie jest już możliwy.";
  }
  if (termin.signup === null && termin.is_full) {
    return "Brak wolnych miejsc — termin jest pełny. Wybierz inny termin.";
  }
  return null;
}

/** Stan ekranu po nieudanym odczycie listy. */
export type BladOdczytu = "zakazane" | "wygasl" | "nie-znaleziono" | "siec" | "blad";

/**
 * 403 `access_expired` → dostęp wygasł; inne 401/403 → brak dostępu (rola bez
 * superwizji); 404 → nie znaleziono; inna odpowiedź serwera → błąd; wyjątek bez
 * odpowiedzi (brak łączności) → sieć.
 */
export function rodzajBleduOdczytu(blad: unknown): BladOdczytu {
  if (!(blad instanceof ApiError)) return "siec";
  if (blad.status === 403 && blad.code === "access_expired") return "wygasl";
  if (blad.status === 401 || blad.status === 403) return "zakazane";
  if (blad.status === 404) return "nie-znaleziono";
  return "blad";
}

export const KOMUNIKAT_SIECI_AKCJI =
  "Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.";

/**
 * Zdanie po nieudanym zapisie albo wypisie — te same przypadki co na starym
 * ekranie: pełny termin i termin innego superwizora mają własne zdania, brak
 * odpowiedzi ma zdanie o połączeniu, reszta to komunikat serwera.
 */
export function komunikatBleduAkcji(blad: unknown): string {
  if (!(blad instanceof ApiError)) return KOMUNIKAT_SIECI_AKCJI;
  if (blad.code === "slot_full") return "Ten termin został właśnie zapełniony. Wybierz inny termin.";
  if (blad.code === "not_your_supervisor") return "Możesz zapisywać się tylko na terminy swojego superwizora.";
  return blad.message;
}
