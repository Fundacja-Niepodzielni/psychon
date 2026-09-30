/**
 * Atrapy odpowiedzi zaplecza dla testów pulpitów. Klucze każdej atrapy są
 * dokładnie właściwościami schematu z `backend/openapi.json` (albo, gdy
 * schemat nie ma nazwanego typu, kluczami zasobu zaplecza) — pilnuje tego
 * `ksztalt-odpowiedzi.test.ts`, który czyta te pliki. Test komponentu z
 * atrapą, której brakuje klucza z zaplecza, przeszedłby przy zepsutym
 * ekranie; tu taka atrapa zostaje wykryta.
 */
import type { KursSciezki, LekcjaKursu } from "../nastepny-krok";
import type { KontoPulpitu, SzczegolKursu, WarunkiCertyfikatu } from "../dane";

export const KURS_UKONCZONY = {
  id: 1,
  slug: "podstawy-pomocy",
  title: "Podstawy pomocy psychologicznej",
  sequence_order: 1,
  product_group: "psychon",
  status: "completed" as const,
  progress_percent: 100,
} satisfies KursSciezki & { product_group: string };

export const KURS_W_TOKU = {
  id: 2,
  slug: "wywiad-psychologiczny",
  title: "Wywiad psychologiczny",
  sequence_order: 2,
  product_group: "psychon",
  status: "in_progress" as const,
  progress_percent: 40,
} satisfies KursSciezki & { product_group: string };

export const KURS_ZABLOKOWANY = {
  id: 3,
  slug: "interwencja-kryzysowa",
  title: "Interwencja kryzysowa",
  sequence_order: 3,
  product_group: "psychon",
  status: "locked" as const,
  progress_percent: 0,
} satisfies KursSciezki & { product_group: string };

/** Kurs studenta: poza ścieżką, `sequence_order = null` (gałąź `student` w `CourseCatalogQuery`). */
export const KURS_STUDENTA_W_TOKU = {
  id: 7,
  slug: "webinar-superwizja",
  title: "Webinar o superwizji",
  sequence_order: null,
  product_group: "psychon",
  status: "in_progress" as const,
  progress_percent: 50,
} satisfies Omit<KursSciezki, "sequence_order"> & { sequence_order: null; product_group: string };

export const KURS_STUDENTA_UKONCZONY = {
  ...KURS_STUDENTA_W_TOKU,
  id: 8,
  slug: "webinar-wprowadzenie",
  title: "Webinar wprowadzający",
  status: "completed" as const,
  progress_percent: 100,
};

export const LEKCJA_UKONCZONA = {
  id: 21,
  title: "Wprowadzenie do wywiadu",
  sequence_order: 1,
  duration_seconds: 1800,
  is_completed: true,
  topic_id: 5,
} satisfies LekcjaKursu & { duration_seconds: number; topic_id: number | null };

export const LEKCJA_DO_ZROBIENIA = {
  id: 22,
  title: "Struktura wywiadu",
  sequence_order: 2,
  duration_seconds: 1200,
  is_completed: false,
  topic_id: 5,
} satisfies LekcjaKursu & { duration_seconds: number; topic_id: number | null };

export const SZCZEGOL_W_TOKU = {
  ...KURS_W_TOKU,
  instructor: null,
  topics: [{ id: 5, title: "Lekcje kursu", position: 1 }],
  lessons: [LEKCJA_UKONCZONA, LEKCJA_DO_ZROBIENIA],
  materials: [],
} satisfies SzczegolKursu & Record<string, unknown>;

export const WARUNKI = {
  eligible: false,
  conditions: [
    { key: "courses" as const, label: "Wszystkie etapy i testy", done: 1, required: 3, met: false },
    { key: "internship" as const, label: "Godziny stażu", done: "12.5", required: "72", met: false },
    { key: "supervision" as const, label: "Obecności na superwizjach", done: 2, required: 6, met: false },
    { key: "workshop" as const, label: "Warsztat stacjonarny", met: false },
  ],
  passed_tests_count: 1,
} satisfies WarunkiCertyfikatu & { passed_tests_count: number };

export const GODZINY = { accepted_hours: "12.5", required_hours: "72" };

export const KONTO_WOLONTARIUSZA = {
  id: 17,
  first_name: "Marta",
  last_name: "Demo",
  email: "marta@demo.pl",
  role: "volunteer",
  roles: ["volunteer"],
  phone: "+48 600 100 200",
  pesel: "90010112345",
  address: { street: "Testowa 1", city: "Warszawa", zip: "00-001" },
  access_expires_at: "2027-02-01T00:00:00Z",
  program_completed_at: null,
  product_group: "psychon",
  consents: [],
} satisfies KontoPulpitu & Record<string, unknown>;

export const KONTO_STUDENTA = { ...KONTO_WOLONTARIUSZA, id: 18, role: "student", roles: ["student"] };

export const KONTO_PO_PROGRAMIE = {
  ...KONTO_WOLONTARIUSZA,
  program_completed_at: "2026-09-01T10:00:00Z",
};

export const TERMIN_SUPERWIZJI = {
  id: 11,
  starts_at: "2027-03-10T17:00:00Z",
  duration_minutes: 90,
  seats_limit: 12,
  location_or_link: "Sala 1",
  active_signups_count: 3,
  available_seats: 9,
  is_full: false,
  can_sign_up: true,
  signup: null,
};

export const ODPOWIEDZ_STAZU_META = {
  current_page: 1,
  per_page: 1,
  total: 0,
  last_page: 1,
  extra: GODZINY,
};
