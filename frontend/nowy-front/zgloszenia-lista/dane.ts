import type { WierszRecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { ApiError, api, apiPaged, type PaginationMeta } from "@/lib/api/klient";
import type { ApplicationItem, ApplicationStatus } from "@/lib/h03/types";
import { ROLE_LABELS } from "@/lib/h18/labels";

/**
 * Dane ekranu „Zgłoszenia rekrutacyjne” — `GET /admin/applications`
 * (`backend/routes/api/h03.php:31`, `ApplicationController::index`) oraz dwa
 * zapisy tej samej grupy tras: `POST /admin/applications/import` (plik CSV,
 * `h03.php:36`) i `POST /admin/applications` (ręczne dodanie, `h03.php:32`).
 * Żadnej innej trasy ekran nie woła. Filtry,
 * które kontroler przyjmuje (`ListApplicationsRequest::rules`): `page`,
 * `per_page` (1–100), `status` (`new|accepted|rejected`), `search` (do 255
 * znaków), `sort`. Ekran używa pierwszych czterech; kolejność to domyślne
 * `-created_at` kontrolera.
 *
 * Odczyt biegnie z przeglądarki (`apiPaged` bierze Bearer z sesji) — ten sam
 * powód co w pozostałych ekranach nowego frontu: serwerowy `@/auth` nie wstaje
 * pod Vitest/jsdom.
 */

export const LICZBA_NA_STRONE = 25;
export const LIMIT_SZUKANEJ_FRAZY = 255;

/**
 * Ścieżka ekranu szczegółu zgłoszenia (A-04): trasa produktu grupy `nabor`
 * (`lib/przelaczenie/grupy.ts`, `/admin/nabor/[id]`), nie trasa poligonu.
 */
export const SCIEZKA_SZCZEGOLU = "/admin/nabor";

export interface FiltrZgloszen {
  status: ApplicationStatus | "";
  search: string;
}

export const PUSTY_FILTR: FiltrZgloszen = { status: "", search: "" };

export interface StronaZgloszen {
  data: ApplicationItem[];
  meta?: PaginationMeta;
}

type WariantPlakietki = "neutral" | "ok" | "warn" | "error" | "pending";

export const PLAKIETKA_STATUSU: Record<ApplicationStatus, { wariant: WariantPlakietki; tekst: string }> = {
  new: { wariant: "pending", tekst: "czeka na decyzję" },
  accepted: { wariant: "ok", tekst: "zatwierdzone" },
  rejected: { wariant: "error", tekst: "odrzucone" },
};

export const OPCJE_STATUSU: { wartosc: string; etykieta: string }[] = [
  { wartosc: "", etykieta: "Wszystkie" },
  // Opcje listy rozwijanej zaczynają się wielką literą; plakietka w wierszu (słownik 2.1) — małą.
  { wartosc: "new", etykieta: "Czeka na decyzję" },
  { wartosc: "accepted", etykieta: "Zatwierdzone" },
  { wartosc: "rejected", etykieta: "Odrzucone" },
];

/** Wybrane filtry jednym zdaniem dla wiersza zwiniętych filtrów: stan, a przy frazie także ona. */
export function podsumowanieFiltra(filtr: FiltrZgloszen): string {
  const stan =
    filtr.status === "" ? "Wszystkie zgłoszenia" : (OPCJE_STATUSU.find((opcja) => opcja.wartosc === filtr.status)?.etykieta ?? filtr.status);
  const fraza = filtr.search.trim();
  return fraza === "" ? stan : `${stan} · „${fraza}”`;
}

export function filtrAktywny(filtr: FiltrZgloszen): boolean {
  return filtr.status !== "" || filtr.search !== "";
}

/** Ścieżka zapytania z parametrami wyłącznie z listy kontrolera. */
export function sciezkaZapytania(filtr: FiltrZgloszen, strona: number): string {
  const parametry = new URLSearchParams();
  parametry.set("page", String(strona));
  parametry.set("per_page", String(LICZBA_NA_STRONE));
  if (filtr.status !== "") parametry.set("status", filtr.status);
  const fraza = filtr.search.trim().slice(0, LIMIT_SZUKANEJ_FRAZY);
  if (fraza !== "") parametry.set("search", fraza);
  return `/admin/applications?${parametry.toString()}`;
}

export function pobierzZgloszenia(filtr: FiltrZgloszen, strona: number): Promise<StronaZgloszen> {
  return apiPaged<ApplicationItem>(sciezkaZapytania(filtr, strona));
}

/** Odmowa z powodu roli (401/403) albo każdy inny błąd, w tym sieci. */
export function rodzajBledu(wyjatek: unknown): "brak-uprawnien" | "siec" {
  if (wyjatek instanceof ApiError && (wyjatek.status === 401 || wyjatek.status === 403)) {
    return "brak-uprawnien";
  }
  return "siec";
}

/** `2026-09-20T10:00:00Z` → `20.09.2026` (data UTC z ISO, bez stref czasowych przeglądarki). */
export function dataPl(iso: string | null): string {
  if (iso === null || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "brak daty";
  const [rok, miesiac, dzien] = iso.slice(0, 10).split("-");
  return `${dzien}.${miesiac}.${rok}`;
}

export function etykietaRoli(rola: string): string {
  return (ROLE_LABELS as Record<string, string>)[rola] ?? "Nieznana rola";
}

/**
 * Wiersz zgłoszenia — ten sam wzór co wiersz osoby i kolejki spraw: pogrubione
 * imię i nazwisko, po „·” meta (e-mail, proponowana rola, data zgłoszenia),
 * plakietka stanu małą literą, akcja „Otwórz” (pełną nazwę „Otwórz zgłoszenie:
 * …” słyszy tylko czytnik ekranu).
 */
export function wierszeZgloszen(zgloszenia: ApplicationItem[]): WierszRecordList[] {
  return zgloszenia.map((zgloszenie) => {
    const nazwa = `${zgloszenie.first_name} ${zgloszenie.last_name}`;
    return {
      id: String(zgloszenie.id),
      tytul: nazwa,
      tytulPogrubiony: true,
      tytulDodatek: `${zgloszenie.email} · proponowana rola: ${etykietaRoli(zgloszenie.role)} · zgłoszono ${dataPl(zgloszenie.created_at)}`,
      plakietka: PLAKIETKA_STATUSU[zgloszenie.status],
      akcja: {
        etykieta: "Otwórz",
        etykietaDostepna: `Otwórz zgłoszenie: ${nazwa}`,
        href: `${SCIEZKA_SZCZEGOLU}/${zgloszenie.id}`,
      },
    };
  });
}

/* ------------------------------------------------------------------ */
/* Import z pliku CSV — `POST /admin/applications/import` (multipart)  */
/* ------------------------------------------------------------------ */

export const ADRES_IMPORTU = "/admin/applications/import";

/** Klucz pliku w żądaniu multipart — ten sam, którego używał stary ekran i który czyta `ImportApplicationsRequest`. */
export const KLUCZ_PLIKU_IMPORTU = "file";

/**
 * Kolumny pierwszego wiersza pliku, bez których zaplecze nie przyjmie importu (`ApplicationCsvImporter`, lista
 * `$required`): nazwa kolumny i jej opis po polsku. Nazwy są dokładnie tymi, które czyta zaplecze (wielkość
 * liter bez znaczenia); próba porównuje je z kodem zaplecza.
 */
export const KOLUMNY_IMPORTU_WYMAGANE = ["first_name", "last_name", "email"] as const;

const OPISY_KOLUMN_IMPORTU: Record<(typeof KOLUMNY_IMPORTU_WYMAGANE)[number], string> = {
  first_name: "imię",
  last_name: "nazwisko",
  email: "adres e-mail",
};

/** Zdanie panelu importu o wymaganych kolumnach: „Wymagane kolumny: first_name (imię), last_name (nazwisko) i email (adres e-mail).” */
export const ZDANIE_KOLUMN_IMPORTU = `Wymagane kolumny: ${KOLUMNY_IMPORTU_WYMAGANE.map((nazwa) => `${nazwa} (${OPISY_KOLUMN_IMPORTU[nazwa]})`)
  .join(", ")
  .replace(/, ([^,]*)$/, " i $1")}.`;

export interface PominietyWiersz {
  line: number;
  reason: string;
}

export interface RaportImportu {
  imported: number;
  skipped: PominietyWiersz[];
}

export async function importujZgloszenia(plik: File): Promise<RaportImportu> {
  const tresc = new FormData();
  tresc.append(KLUCZ_PLIKU_IMPORTU, plik);
  const raport = await api<Partial<RaportImportu> | null>(ADRES_IMPORTU, { method: "POST", body: tresc });
  return {
    imported: typeof raport?.imported === "number" ? raport.imported : 0,
    skipped: Array.isArray(raport?.skipped) ? raport.skipped : [],
  };
}

/** Powody pominięcia wiersza, które zwraca `ApplicationCsvImporter` — kod z serwera nie wychodzi na ekran. */
const POWODY_POMINIECIA: Record<string, string> = {
  empty_file: "Plik jest pusty.",
  missing_first_name: "Brakuje imienia.",
  missing_last_name: "Brakuje nazwiska.",
  invalid_email: "Adres e-mail jest nieprawidłowy.",
  duplicate_email: "Zgłoszenie z tym adresem e-mail już jest na liście albo adres powtarza się w pliku.",
  email_already_registered: "Konto z tym adresem e-mail już istnieje.",
  invalid_role: "Nieznana rola.",
  invalid_graduation_year: "Rok ukończenia studiów jest nieprawidłowy.",
  invalid_consent_date: "Data zgody jest nieprawidłowa.",
};

const PREFIKS_BRAKUJACYCH_KOLUMN = "missing_headers:";

export function powodPominiecia(kod: string): string {
  if (kod.startsWith(PREFIKS_BRAKUJACYCH_KOLUMN)) {
    const kolumny = kod.slice(PREFIKS_BRAKUJACYCH_KOLUMN.length).split(",").filter((k) => k !== "");
    return kolumny.length > 0
      ? `W pierwszym wierszu pliku brakuje wymaganych kolumn: ${kolumny.join(", ")}.`
      : "W pierwszym wierszu pliku brakuje wymaganych kolumn.";
  }
  return POWODY_POMINIECIA[kod] ?? "Wiersz ma nieprawidłowe dane.";
}

export const TEKST_BLEDU_PLIKU = "Nie udało się wczytać pliku. Sprawdź plik i spróbuj jeszcze raz.";

export type BladImportu =
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "plik"; komunikat: string }
  | { rodzaj: "serwer" }
  | { rodzaj: "siec" };

/** 401/403 → odmowa roli; 422 (i 413) → zły plik z komunikatem serwera; inny błąd serwera; brak odpowiedzi. */
export function klasyfikujBladImportu(wyjatek: unknown): BladImportu {
  if (!(wyjatek instanceof ApiError)) return { rodzaj: "siec" };
  if (wyjatek.status === 401 || wyjatek.status === 403) return { rodzaj: "brak-uprawnien" };
  if (wyjatek.status === 422) {
    const komunikat = wyjatek.errors?.file?.[0];
    return { rodzaj: "plik", komunikat: komunikat && komunikat.trim() !== "" ? komunikat : TEKST_BLEDU_PLIKU };
  }
  if (wyjatek.status === 413) return { rodzaj: "plik", komunikat: "Plik może mieć najwyżej 5 MB." };
  return { rodzaj: "serwer" };
}

/* ------------------------------------------------------------------ */
/* Ręczne dodanie — `POST /admin/applications`                         */
/* ------------------------------------------------------------------ */

export const ADRES_DODANIA = "/admin/applications";

export interface FormularzZgloszenia {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}

export const PUSTY_FORMULARZ_ZGLOSZENIA: FormularzZgloszenia = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
};

export function dodajZgloszenie(formularz: FormularzZgloszenia): Promise<ApplicationItem> {
  const telefon = formularz.phone.trim();
  return api<ApplicationItem>(ADRES_DODANIA, {
    method: "POST",
    body: {
      first_name: formularz.first_name.trim(),
      last_name: formularz.last_name.trim(),
      email: formularz.email.trim(),
      ...(telefon !== "" ? { phone: telefon } : {}),
    },
  });
}

export type BladDodania =
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "pola"; bledy: Partial<Record<keyof FormularzZgloszenia, string>>; pozostale: string[] }
  | { rodzaj: "duplikat" }
  | { rodzaj: "serwer" }
  | { rodzaj: "siec" };

const POLA_FORMULARZA: (keyof FormularzZgloszenia)[] = ["first_name", "last_name", "email", "phone"];

/** 401/403 → odmowa roli; 422 → błędy pod polami z `error.errors`; 409 → duplikat adresu; reszta → serwer/sieć. */
export function klasyfikujBladDodania(wyjatek: unknown): BladDodania {
  if (!(wyjatek instanceof ApiError)) return { rodzaj: "siec" };
  if (wyjatek.status === 401 || wyjatek.status === 403) return { rodzaj: "brak-uprawnien" };
  if (wyjatek.status === 409) return { rodzaj: "duplikat" };
  if (wyjatek.status === 422 && wyjatek.errors) {
    const bledy: Partial<Record<keyof FormularzZgloszenia, string>> = {};
    const pozostale: string[] = [];
    for (const [klucz, komunikaty] of Object.entries(wyjatek.errors)) {
      const pierwszy = komunikaty[0] ?? "Nieprawidłowa wartość.";
      const pole = POLA_FORMULARZA.find((p) => p === klucz);
      if (pole) bledy[pole] = pierwszy;
      else pozostale.push(pierwszy);
    }
    return { rodzaj: "pola", bledy, pozostale };
  }
  return { rodzaj: "serwer" };
}
