import { ApiError, api } from "@/lib/api/klient";

/**
 * Dane ekranu „Ustawienia roku programu” (A-29) — trasy `GET` i `PATCH`
 * `/admin/edition` (`backend/routes/api/h19.php:27-28`,
 * `EditionSettingsController`). Dostęp: `project_manager`, `super_admin`.
 *
 * Kształt odpowiedzi: `EditionResource`
 * (`backend/app/Http/Resources/EditionResource.php:19-33`), schemat
 * `backend/openapi.json` (`components.schemas.EditionResource`). Zakresy
 * pól: `UpdateEditionRequest::rules()`
 * (`backend/app/Http/Requests/H19/UpdateEditionRequest.php:22-31`),
 * powtórzone w `ZAKRESY` i porównywane z `openapi.json` przez test.
 *
 * Wołane z przeglądarki (`lib/api/klient.ts`) — ten sam powód co
 * `nowy-front/formy-stazu/dane.ts`: moduł `@/auth` nie wstaje pod
 * Vitest/jsdom na trasach statycznych.
 */

/** Klucze ustawień z kontraktu §3.3 — jedyne pola tego ekranu. */
export const KLUCZE_USTAWIEN = [
  "test_pass_threshold",
  "test_attempts_limit",
  "internship_hours_required",
  "supervision_required_count",
  "lesson_completion_percent",
  "reliability_threshold",
] as const;

export type KluczUstawienia = (typeof KLUCZE_USTAWIEN)[number];

/** Odpowiedź `GET`/`PATCH /admin/edition` (pełny `EditionResource`). */
export interface RokProgramu extends Record<KluczUstawienia, number> {
  id: number;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  seats_limit: number | null;
}

/** Dozwolone wartości (włącznie) — `UpdateEditionRequest::rules()`. */
export const ZAKRESY: Record<KluczUstawienia, readonly [number, number]> = {
  test_pass_threshold: [0, 100],
  test_attempts_limit: [1, 255],
  internship_hours_required: [1, 32767],
  supervision_required_count: [1, 255],
  lesson_completion_percent: [0, 100],
  reliability_threshold: [0, 100],
};

export interface DefinicjaPola {
  klucz: KluczUstawienia;
  etykieta: string;
  /** Jedno zdanie: na co wpływa ten próg. */
  zdanie: string;
}

/**
 * Kolejność = kolejność na ekranie. `FormSection` pokazuje pierwsze pięć pól
 * od razu, szóste trafia do zwijanej sekcji — dlatego próg ukończenia lekcji
 * (piąty) i próg czasu nauki (szósty, w sekcji „Czas nauki”) stoją obok siebie,
 * a oba zdania mówią wprost, że to dwa różne progi (kontrakt §3.3).
 */
export const POLA: readonly DefinicjaPola[] = [
  {
    klucz: "test_pass_threshold",
    etykieta: "Próg zaliczenia testu, w procentach (0–100)",
    zdanie: "Tyle procent poprawnych odpowiedzi trzeba mieć, żeby zaliczyć test na koniec kursu.",
  },
  {
    klucz: "test_attempts_limit",
    etykieta: "Liczba podejść do testu (1–255)",
    zdanie: "Tyle razy uczestnik może podejść do testu na koniec kursu, zanim administracja przywróci mu limit.",
  },
  {
    klucz: "internship_hours_required",
    etykieta: "Wymagana liczba godzin praktyki (1–32767)",
    zdanie: "Tyle godzin zatwierdzonych dyżurów uczestnik musi mieć, żeby dostać certyfikat.",
  },
  {
    klucz: "supervision_required_count",
    etykieta: "Wymagana liczba obecności na superwizji (1–255)",
    zdanie: "Tyle obecności na superwizji uczestnik musi mieć, żeby dostać certyfikat.",
  },
  {
    klucz: "lesson_completion_percent",
    etykieta: "Próg ukończenia lekcji, w procentach (0–100)",
    zdanie:
      "Tyle procent czasu lekcji uczestnik musi spędzić na nauce, żeby oznaczyć lekcję jako ukończoną; to inny próg niż próg czasu nauki poniżej.",
  },
  {
    klucz: "reliability_threshold",
    etykieta: "Próg czasu nauki, w procentach (0–100)",
    zdanie:
      "Uczestnicy poniżej tego progu są zaznaczani na liście czasu nauki; ten próg nie wpływa na ukończenie lekcji.",
  },
];

export type FormularzUstawien = Record<KluczUstawienia, string>;

export function pobierzRokProgramu(): Promise<RokProgramu> {
  return api<RokProgramu>("/admin/edition");
}

/** `PATCH /admin/edition` — częściowy; serwer zwraca pełny `EditionResource`. */
export function zapiszRokProgramu(zmiany: Partial<Record<KluczUstawienia, number | string>>): Promise<RokProgramu> {
  return api<RokProgramu>("/admin/edition", { method: "PATCH", body: zmiany });
}

export function formularzZRoku(rok: RokProgramu): FormularzUstawien {
  return Object.fromEntries(KLUCZE_USTAWIEN.map((klucz) => [klucz, String(rok[klucz])])) as FormularzUstawien;
}

/**
 * Tylko pola, które osoba zmieniła względem zapisanych wartości — `PATCH` jest
 * częściowy, a serwer wpisuje do dziennika działań klucze z ciała żądania, więc
 * ciało z niezmienionymi polami zapisałoby nieprawdę o tym, co się zmieniło.
 * Zapis liczbowy (całkowity) idzie jako liczba; wszystko inne — puste pole,
 * litery, ułamek — idzie dosłownie, żeby walidacja serwera zobaczyła to, co
 * wpisano, a nie cichą zamianę na `0`.
 */
export function zmianyDoZapisu(
  zapisane: RokProgramu,
  formularz: FormularzUstawien,
): Partial<Record<KluczUstawienia, number | string>> {
  const zmiany: Partial<Record<KluczUstawienia, number | string>> = {};
  for (const klucz of KLUCZE_USTAWIEN) {
    const wpisane = formularz[klucz].trim();
    if (wpisane === String(zapisane[klucz])) continue;
    zmiany[klucz] = /^-?\d+$/.test(wpisane) ? Number(wpisane) : wpisane;
  }
  return zmiany;
}

export interface BledyUstawien {
  pola: Partial<Record<KluczUstawienia, string>>;
  /** Komunikaty do pól spoza tego ekranu — nie gubimy ich po cichu. */
  pozostale: string[];
}

/** Rozkłada `errors` z koperty 422 na pola ekranu i resztę. */
export function bledyZOdpowiedzi(errors: Record<string, string[]> | undefined): BledyUstawien {
  const wynik: BledyUstawien = { pola: {}, pozostale: [] };
  for (const [nazwa, komunikaty] of Object.entries(errors ?? {})) {
    const komunikat = komunikaty[0];
    if (!komunikat) continue;
    if ((KLUCZE_USTAWIEN as readonly string[]).includes(nazwa)) {
      wynik.pola[nazwa as KluczUstawienia] = komunikat;
    } else {
      wynik.pozostale.push(komunikat);
    }
  }
  return wynik;
}

export type RodzajBledu = "brak-uprawnien" | "brak" | "walidacja" | "siec";

/** 401/403 to odmowa, 404 to brak roku programu, 422 to pola, reszta to sieć. */
export function rodzajBledu(blad: unknown): RodzajBledu {
  if (blad instanceof ApiError) {
    if (blad.status === 401 || blad.status === 403) return "brak-uprawnien";
    if (blad.status === 404) return "brak";
    if (blad.status === 422) return "walidacja";
  }
  return "siec";
}
