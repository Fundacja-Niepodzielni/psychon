import { api } from "@/lib/api/klient";
import { ROLE_LABELS } from "@/lib/h18/labels";
import type { StatRow } from "@/design-system/organizmy/StatRow/StatRow";
import type { KolumnaDataTable, WierszDataTable } from "@/design-system/organizmy/DataTable/DataTable";

/** `StatRow` nie eksportuje `KafelStatRow` jako nazwany typ — odczytany
 * strukturalnie z jej własnych właściwości, bez kopiowania kształtu ręcznie. */
type KafelStatRow = Parameters<typeof StatRow>[0]["kafle"][number];

/**
 * Karta osoby (H18, administracja) — `GET /admin/users/{id}` i
 * `PATCH /admin/users/{id}` (`backend/routes/api/h18.php:28,30`,
 * `AdminUserController::show`/`update`, `AdminUserCardResource.php:32-78`).
 * Rzetelność osobno, `GET /admin/reliability/{userId}`
 * (`backend/routes/api/h07.php:18`, `ReliabilityController::adminShow`,
 * `AdminReliabilityResource.php:10-19`).
 *
 * Kształty `openapi.json` dla obu tras są puste (`data: array, items: {}`,
 * generator nie wyprowadził typów — luka do zgłoszenia, nie do naprawy tutaj);
 * typy niżej odczytane wprost z zasobów backendu.
 */

export interface AdresOsoby {
  street: string | null;
  city: string | null;
  zip: string | null;
}

export interface ProfilOsobyKarty {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  phone: string | null;
  pesel: string | null;
  address: AdresOsoby;
  access_expires_at: string | null;
  program_completed_at: string | null;
  product_group: string;
}

/** `AdminUserCardResource.php:38-46` — siedem pól, cztery z nich filary. */
export interface PostepOsobyKarty {
  courses_done: number;
  courses_total: number;
  hours_accepted: string;
  supervision_present: number;
  workshop_done: boolean;
  path_tests_passed: number;
  path_tests_total: number;
}

/** `NotificationResource.php:16-27`. */
export interface PowiadomienieKarty {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

/**
 * `AdminUserCardResource.php:69-76` — WYŁĄCZNIE rodzaj zdarzenia, czas
 * i kto go wykonal. Pole ładunku istnieje w zasobie (`AdminUserCardResource.php:73`,
 * `details`), ale ten typ go celowo NIE niesie — moduł ekranu nie ma jak
 * odczytać pola, którego własny typ nie deklaruje.
 */
export interface WpisDziennikaKarty {
  id: number;
  action: string;
  actor_id: number | null;
  created_at: string | null;
}

export interface KartaOsobyDane {
  profile: ProfilOsobyKarty;
  progress: PostepOsobyKarty;
  recent_notifications: PowiadomienieKarty[];
  audit_entries: WpisDziennikaKarty[];
}

/** `AdminReliabilityResource.php:10-19`. */
export interface RzetelnoscOsobyKarty {
  reliability_percent: string | null;
  below_threshold: boolean;
}

export function pobierzKarteOsoby(id: number): Promise<KartaOsobyDane> {
  return api<KartaOsobyDane>(`/admin/users/${id}`);
}

export function pobierzRzetelnoscOsoby(id: number): Promise<RzetelnoscOsobyKarty> {
  return api<RzetelnoscOsobyKarty>(`/admin/reliability/${id}`);
}

/** Pola formularza „Zmień dane" — `UpdateUserRequest.php:26-38`, bez `role`
 * (zmiana roli = ekran A-09, poza zakresem tego ekranu). */
export interface DaneFormularzaKarty {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  pesel: string;
  address_street: string;
  address_city: string;
  address_zip: string;
  product_group: string;
}

export function zapiszKarteOsoby(id: number, dane: DaneFormularzaKarty): Promise<KartaOsobyDane> {
  return api<KartaOsobyDane>(`/admin/users/${id}`, {
    method: "PATCH",
    body: {
      first_name: dane.first_name,
      last_name: dane.last_name,
      email: dane.email,
      phone: dane.phone === "" ? null : dane.phone,
      pesel: dane.pesel === "" ? null : dane.pesel,
      address: {
        street: dane.address_street === "" ? null : dane.address_street,
        city: dane.address_city === "" ? null : dane.address_city,
        zip: dane.address_zip === "" ? null : dane.address_zip,
      },
      product_group: dane.product_group,
    },
  });
}

export function formularzZProfilu(profile: ProfilOsobyKarty): DaneFormularzaKarty {
  return {
    first_name: profile.first_name,
    last_name: profile.last_name,
    email: profile.email,
    phone: profile.phone ?? "",
    pesel: profile.pesel ?? "",
    address_street: profile.address.street ?? "",
    address_city: profile.address.city ?? "",
    address_zip: profile.address.zip ?? "",
    product_group: profile.product_group,
  };
}

const OPCJE_GRUPY_PRODUKTOWEJ = [
  { wartosc: "psychon", etykieta: "PsychON" },
  { wartosc: "dobrostan", etykieta: "Dobrostan" },
  { wartosc: "both", etykieta: "Obie" },
];

/** Konfiguracja pól formularza „Zmień dane" — kolejność decyduje, które pięć
 * `FormSection` pokazuje od razu (`FormSection.tsx:85`), a które trafiają do
 * `CollapsibleSection` (`FormSection.tsx:86`). Brak pola `role` jest tu
 * strukturalny, nie tylko pominięty w renderze. */
export const POLA_FORMULARZA_KARTY: ReadonlyArray<{
  klucz: keyof DaneFormularzaKarty;
  id: string;
  etykieta: string;
  rodzaj: "tekst" | "wybor";
  opcje?: typeof OPCJE_GRUPY_PRODUKTOWEJ;
  wymagane?: boolean;
}> = [
  { klucz: "first_name", id: "karta-osoby-first_name", etykieta: "Imię", rodzaj: "tekst", wymagane: true },
  { klucz: "last_name", id: "karta-osoby-last_name", etykieta: "Nazwisko", rodzaj: "tekst", wymagane: true },
  { klucz: "email", id: "karta-osoby-email", etykieta: "E-mail", rodzaj: "tekst", wymagane: true },
  { klucz: "phone", id: "karta-osoby-phone", etykieta: "Telefon", rodzaj: "tekst" },
  { klucz: "pesel", id: "karta-osoby-pesel", etykieta: "PESEL", rodzaj: "tekst" },
  { klucz: "address_street", id: "karta-osoby-address_street", etykieta: "Ulica", rodzaj: "tekst" },
  { klucz: "address_city", id: "karta-osoby-address_city", etykieta: "Miasto", rodzaj: "tekst" },
  { klucz: "address_zip", id: "karta-osoby-address_zip", etykieta: "Kod pocztowy", rodzaj: "tekst" },
  {
    klucz: "product_group",
    id: "karta-osoby-product_group",
    etykieta: "Grupa produktowa",
    rodzaj: "wybor",
    opcje: OPCJE_GRUPY_PRODUKTOWEJ,
    wymagane: true,
  },
];

/** Klucz błędu 422 dla danego pola formularza (`errors` z koperty błędu,
 * kontrakt §1) — zagnieżdżony adres niesie kropkę, tak jak `UpdateUserRequest`
 * go waliduje. */
export function kluczBleduPola(klucz: keyof DaneFormularzaKarty): string {
  switch (klucz) {
    case "address_street":
      return "address.street";
    case "address_city":
      return "address.city";
    case "address_zip":
      return "address.zip";
    default:
      return klucz;
  }
}

/**
 * Cztery filary z `progress` (`AdminUserCardResource.php:38-46`, liczby
 * wprost z karty, bez własnej reguły liczenia) + rzetelność z H07.
 * `rzetelnosc === null` pokrywa RAZEM dwa stany karty: `reliability_percent`
 * pusty (osoba bez mierzalnej ukończonej lekcji) i 404 trasy H07 (osoba spoza
 * zakresu rzetelności) — w obu przypadkach kafel rzetelności nie ma liczby.
 */
export function filaryKartyOsoby(
  progress: PostepOsobyKarty,
  rzetelnosc: RzetelnoscOsobyKarty | null,
): KafelStatRow[] {
  const procentKursow =
    progress.courses_total > 0 ? Math.round((progress.courses_done / progress.courses_total) * 100) : undefined;

  const procentRzetelnosci =
    rzetelnosc?.reliability_percent != null ? Number(rzetelnosc.reliability_percent) : undefined;

  return [
    {
      id: "filar-kursy",
      etykieta: "Kursy",
      wartosc: progress.courses_done,
      mianownik: `z ${progress.courses_total}`,
      procent: procentKursow,
    },
    {
      id: "filar-staz",
      etykieta: "Godziny stażu",
      wartosc: Number(progress.hours_accepted),
      mianownik: "godzin",
    },
    {
      id: "filar-superwizje",
      etykieta: "Obecności na superwizjach",
      wartosc: progress.supervision_present,
      mianownik: "obecności",
    },
    {
      id: "filar-warsztat",
      etykieta: "Warsztat stacjonarny",
      wartosc: progress.workshop_done ? 1 : 0,
      mianownik: progress.workshop_done ? "ukończony" : "nieukończony",
    },
    {
      id: "filar-rzetelnosc",
      etykieta: "Rzetelność nauki",
      wartosc: procentRzetelnosci,
      mianownik: "%",
      procent: procentRzetelnosci,
      podpowiedz: rzetelnosc?.below_threshold ? "Poniżej progu rzetelności." : undefined,
    },
  ];
}

const KOLUMNY_DANYCH_OSOBY: KolumnaDataTable[] = [
  { klucz: "pole", etykieta: "Pole" },
  { klucz: "wartosc", etykieta: "Wartość" },
];

function tekstAlboBrak(wartosc: string | null): string {
  return wartosc && wartosc.trim() !== "" ? wartosc : "Brak danych";
}

/** Dane kontaktowe + data wygaśnięcia dostępu jako wiersze `DataTable`
 * (`01-SCIEZKI-UZYTKOWNIKOW.md` w. 283: „dane kontaktowe obok czterech
 * filarów"). Czysta funkcja, testowalna bez sieci. */
export function wierszeDanychOsoby(profile: ProfilOsobyKarty): WierszDataTable[] {
  const adres = [profile.address.street, profile.address.city, profile.address.zip]
    .filter((czesc) => czesc && czesc.trim() !== "")
    .join(", ");

  return [
    { id: "imie", wartosci: { pole: "Imię i nazwisko", wartosc: `${profile.first_name} ${profile.last_name}` } },
    { id: "email", wartosci: { pole: "E-mail", wartosc: profile.email } },
    { id: "telefon", wartosci: { pole: "Telefon", wartosc: tekstAlboBrak(profile.phone) } },
    { id: "pesel", wartosci: { pole: "PESEL", wartosc: tekstAlboBrak(profile.pesel) } },
    { id: "adres", wartosci: { pole: "Adres", wartosc: adres === "" ? "Brak danych" : adres } },
    { id: "grupa", wartosci: { pole: "Grupa produktowa", wartosc: profile.product_group } },
    {
      id: "dostep",
      wartosci: { pole: "Dostęp wygasa", wartosc: profile.access_expires_at ?? "Bezterminowo" },
    },
  ];
}

export function kolumnyDanychOsoby(): KolumnaDataTable[] {
  return KOLUMNY_DANYCH_OSOBY;
}

/** Opis roli do nagłówka karty: etykieta polska z `ROLE_LABELS` albo `undefined`
 * dla roli spoza słownika — surowy kod roli nigdy nie trafia do interfejsu. */
export function opisRoliOsoby(rola: string): string | undefined {
  const etykieta = (ROLE_LABELS as Record<string, string | undefined>)[rola];
  return etykieta ? `Rola: ${etykieta}` : undefined;
}
