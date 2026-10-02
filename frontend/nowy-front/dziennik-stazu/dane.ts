import { api, apiPaged, ApiError, type PaginationMeta } from "@/lib/api/klient";
import { formatujDate } from "../wspolne/daty";
import { formatujDziesietny } from "../wspolne/formatuj-dziesietny";
import { odmien } from "../wspolne/odmiana";

/**
 * Dane dziennika stażu osoby wolontariackiej. Dokładnie te same trzy żądania,
 * z tymi samymi polami, co stary ekran `components/h11/InternshipJournal.tsx`
 * (trasy: `backend/routes/api/h11.php:25-30`):
 *  - `GET   /internship/entries?page={n}&per_page=25` — własne wpisy i
 *    `meta.extra` (`accepted_hours`, `required_hours`),
 *  - `POST  /internship/entries`      — nowy wpis,
 *  - `PATCH /internship/entries/{id}` — poprawka wpisu czekającego na decyzję
 *    albo odesłanego do poprawy.
 * Ciało zapisu: `date`, `hours` (napis, jak w polu), `form`,
 * `consultations_count` (`Number(...)` z pola — pusty napis daje 0, jak dotąd)
 * i `description` (pusty napis wysyłany jako `null`). Kształt wpisu:
 * `backend/app/Http/Resources/H11/InternshipEntryResource.php`.
 *
 * Wołane z przeglądarki przez `lib/api/klient.ts` — token płynie z sesji,
 * tak samo jak na pozostałych ekranach nowego frontu.
 */

export type StanWpisu = "submitted" | "accepted" | "returned" | "rejected";
export type FormaDyzuru = "phone_duty" | "chat_duty" | "other";

export interface WpisStazu {
  id: number;
  /** Data kalendarzowa `RRRR-MM-DD`. */
  date: string;
  /** Dziesiętny string z serwera — nigdy liczba. */
  hours: string;
  form: FormaDyzuru;
  consultations_count: number;
  description: string | null;
  status: StanWpisu;
  review_comment: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GodzinyStazu {
  zatwierdzone: string;
  wymagane: string;
}

export interface StronaDziennika {
  wpisy: WpisStazu[];
  meta: PaginationMeta | undefined;
  godziny: GodzinyStazu;
}

/** Liczba wpisów na stronę — tyle samo, ile prosił stary ekran. */
export const NA_STRONE = 25;

/**
 * Nazwy form dyżuru. Zasób wpisu niesie tylko kod (`form`), a słownik form
 * z nazwami (`GET /admin/internship/forms`) jest dostępny wyłącznie dla
 * administracji — dlatego nazwy zostają te same, co na starym ekranie.
 */
export const NAZWY_FORM: Record<FormaDyzuru, string> = {
  phone_duty: "Dyżur telefoniczny",
  chat_duty: "Czat",
  other: "Inna forma",
};

export const KOLEJNOSC_FORM: FormaDyzuru[] = ["phone_duty", "chat_duty", "other"];

export function nazwaFormy(forma: string): string {
  return NAZWY_FORM[forma as FormaDyzuru] ?? NAZWY_FORM.other;
}

/**
 * Nazwy stanów wpisu — te same słowa, którymi ekran decyzji o dyżurach
 * (`nowy-front/staz-kolejka`) mówi o tym samym wpisie: „czeka”, „zatwierdzony”,
 * „odesłany do poprawy”, „odrzucony”. Jedna nazwa na stan na obu ekranach.
 */
export const STANY_WPISU: Record<StanWpisu, { tekst: string; wariant: "pending" | "ok" | "warn" | "error" }> = {
  submitted: { tekst: "Czeka na decyzję", wariant: "pending" },
  accepted: { tekst: "Zatwierdzony", wariant: "ok" },
  returned: { tekst: "Odesłany do poprawy", wariant: "warn" },
  rejected: { tekst: "Odrzucony", wariant: "error" },
};

export function stanWpisu(stan: string): { tekst: string; wariant: "pending" | "ok" | "warn" | "error" } {
  return STANY_WPISU[stan as StanWpisu] ?? STANY_WPISU.submitted;
}

/** Wpis można poprawić, dopóki czeka na decyzję albo wrócił do poprawy (tak jak na starym ekranie). */
export function czyDoPoprawy(wpis: WpisStazu): boolean {
  return wpis.status === "submitted" || wpis.status === "returned";
}

/** Godziny z API jako tekst do ekranu: „3,5 godz.”. */
export function tekstGodzin(godziny: string): string {
  return `${formatujDziesietny(godziny)} godz.`;
}

/** „4 konsultacje”, „1 konsultacja”, „0 konsultacji”. */
export function tekstKonsultacji(liczba: number): string {
  return `${liczba} ${odmien(liczba, "konsultacja", "konsultacje", "konsultacji")}`;
}

/** „1 wpis”, „3 wpisy”, „12 wpisów”. */
export function tekstWpisow(liczba: number): string {
  return `${liczba} ${odmien(liczba, "wpis", "wpisy", "wpisów")}`;
}

/** Nazwa wpisu w zdaniach i nazwach przycisków: „wpis z 27 sierpnia 2026”. */
export function nazwaWpisu(wpis: WpisStazu): string {
  return `wpis z ${formatujDate(wpis.date)}`;
}

/**
 * Brakujące godziny (wymagane minus zatwierdzone) jako dziesiętny string, `"0"`
 * gdy już ich nie brakuje, albo `null`, gdy któraś liczba nie jest liczbą.
 */
export function brakujaceGodziny(godziny: GodzinyStazu): string | null {
  const wymagane = Number(godziny.wymagane);
  const zatwierdzone = Number(godziny.zatwierdzone);
  if (godziny.wymagane.trim() === "" || !Number.isFinite(wymagane) || !Number.isFinite(zatwierdzone)) return null;
  return String(Math.max(0, wymagane - zatwierdzone));
}

export async function pobierzDziennik(strona: number): Promise<StronaDziennika> {
  const { data, meta } = await apiPaged<WpisStazu>(`/internship/entries?page=${strona}&per_page=${NA_STRONE}`);
  return {
    wpisy: data,
    meta,
    godziny: {
      zatwierdzone: String(meta?.extra?.accepted_hours ?? "0"),
      wymagane: String(meta?.extra?.required_hours ?? "0"),
    },
  };
}

/** Wartości formularza wpisu — wszystkie jako napisy, tak jak w polach. */
export interface PolaWpisu {
  date: string;
  hours: string;
  form: FormaDyzuru;
  consultations_count: string;
  description: string;
}

/** Dzisiejsza data kalendarzowa `RRRR-MM-DD` w strefie przeglądarki (jak na starym ekranie). */
export function dzisiaj(teraz: Date = new Date()): string {
  const miesiac = `${teraz.getMonth() + 1}`.padStart(2, "0");
  const dzien = `${teraz.getDate()}`.padStart(2, "0");
  return `${teraz.getFullYear()}-${miesiac}-${dzien}`;
}

export function pustyFormularz(teraz: Date = new Date()): PolaWpisu {
  return { date: dzisiaj(teraz), hours: "0.5", form: "phone_duty", consultations_count: "0", description: "" };
}

export function polaZWpisu(wpis: WpisStazu): PolaWpisu {
  return {
    date: wpis.date,
    hours: wpis.hours,
    form: wpis.form,
    consultations_count: `${wpis.consultations_count}`,
    description: wpis.description ?? "",
  };
}

/** Ciało `POST`/`PATCH` — dokładnie pięć pól starego ekranu. */
export function cialoZapisu(pola: PolaWpisu) {
  return {
    date: pola.date,
    hours: pola.hours,
    form: pola.form,
    consultations_count: Number(pola.consultations_count),
    description: pola.description || null,
  };
}

/** Zapis nowego wpisu (`id === null`) albo poprawka istniejącego. */
export function zapiszWpis(id: number | null, pola: PolaWpisu): Promise<WpisStazu> {
  const body = cialoZapisu(pola);
  return id === null
    ? api<WpisStazu>("/internship/entries", { method: "POST", body })
    : api<WpisStazu>(`/internship/entries/${id}`, { method: "PATCH", body });
}

/** Stan ekranu po nieudanym odczycie dziennika. */
export type BladOdczytu = "zakazane" | "wygasl" | "nie-znaleziono" | "siec" | "blad";

/**
 * 403 `access_expired` → dostęp wygasł; inne 401/403 → brak dostępu (rola bez
 * dziennika); 404 → nie znaleziono; inna odpowiedź serwera → błąd; wyjątek bez
 * odpowiedzi (brak łączności) → sieć.
 */
export function rodzajBleduOdczytu(blad: unknown): BladOdczytu {
  if (!(blad instanceof ApiError)) return "siec";
  if (blad.status === 403 && blad.code === "access_expired") return "wygasl";
  if (blad.status === 401 || blad.status === 403) return "zakazane";
  if (blad.status === 404) return "nie-znaleziono";
  return "blad";
}

/** Pola formularza, przy których ekran pokazuje błąd z serwera. */
export const POLA_FORMULARZA = ["date", "hours", "form", "consultations_count", "description"] as const;

export type BladZapisu =
  | { rodzaj: "pola"; bledy: Record<string, string[]>; pozostale: string[] }
  | { rodzaj: "zablokowany"; komunikat: string }
  | { rodzaj: "brak-wpisu"; komunikat: string }
  | { rodzaj: "siec"; komunikat: string }
  | { rodzaj: "inny"; komunikat: string };

export const KOMUNIKAT_SIECI_ZAPISU =
  "Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie — wpisane dane zostały w formularzu.";

/**
 * 422 z błędami pól → błędy przy polach (błędy pól spoza formularza idą do
 * zdania ogólnego); 403 `entry_locked` → wpis już rozstrzygnięty; 404 → wpisu
 * nie ma; brak odpowiedzi → sieć; reszta → komunikat serwera.
 */
export function sklasyfikujBladZapisu(blad: unknown): BladZapisu {
  if (!(blad instanceof ApiError)) return { rodzaj: "siec", komunikat: KOMUNIKAT_SIECI_ZAPISU };
  if (blad.status === 422 && blad.errors) {
    const pozostale = Object.entries(blad.errors)
      .filter(([pole]) => !(POLA_FORMULARZA as readonly string[]).includes(pole))
      .flatMap(([, komunikaty]) => komunikaty);
    return { rodzaj: "pola", bledy: blad.errors, pozostale };
  }
  if (blad.status === 403 && blad.code === "entry_locked") return { rodzaj: "zablokowany", komunikat: blad.message };
  if (blad.status === 404) return { rodzaj: "brak-wpisu", komunikat: blad.message };
  return { rodzaj: "inny", komunikat: blad.message };
}
