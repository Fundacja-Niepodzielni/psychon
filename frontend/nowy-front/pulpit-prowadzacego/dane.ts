/**
 * Dane pulpitu prowadzącego — trzy odczyty, każdy niezależny od pozostałych
 * (awaria jednego nie kasuje dwóch pozostałych):
 *
 * - `GET /instructor/questions?answered=false` (`backend/routes/api/h17.php:37`,
 *   `InstructorQuestionController::index`; liczba bez odpowiedzi w
 *   `meta.extra.unanswered`, niezależna od strony),
 * - `GET /instructor/group` (`h12.php:35`, `InstructorSupervisionController::group`),
 * - `GET /instructor/courses` (`h09.php:37`, `MyInstructorProfileController::courses`).
 *
 * Odczyt biegnie z przeglądarki — ten sam powód co w
 * `nowy-front/formy-stazu/dane.ts`: `@/auth` po stronie serwera nie wstaje pod
 * Vitest/jsdom na trasach statycznych.
 */
import { api, ApiError } from "@/lib/api/klient";
import { fetchInstructorQuestions, unansweredCount, type InstructorQuestion } from "@/lib/questions";
import type { InstructorGroup, InstructorSlot } from "@/lib/h12/types";
import type { StatRow } from "@/design-system/organizmy/StatRow/StatRow";
import { formatujDate, formatujDateICzas } from "../wspolne/daty";

/** Kształt z `MyInstructorProfileController::courses` (`h09`, wiersze 63-71). */
export interface KursProwadzacego {
  id: number;
  slug: string;
  title: string;
  sequence_order: number | null;
}

/** Ekrany prowadzącego, które już istnieją — pulpit tylko do nich odsyła. */
export const ADRES_PYTAN = "/prowadzacy/pytania";
export const ADRES_GRUPY = "/prowadzacy/grupa";
export const ADRES_KURSOW = "/prowadzacy/kursy";

export type RodzajAwarii = "zakazane" | "siec" | "blad";

export type Sekcja<T> = { stan: "ok"; dane: T } | { stan: "awaria"; rodzaj: RodzajAwarii };

export interface PytaniaPulpitu {
  /** Liczba w całej skrzynce (`meta.extra.unanswered`), nie długość strony. */
  liczba: number;
  /** Pierwsza strona pytań bez odpowiedzi, od najnowszego. */
  wiersze: InstructorQuestion[];
}

export interface DanePulpitu {
  pytania: Sekcja<PytaniaPulpitu>;
  grupa: Sekcja<InstructorGroup>;
  kursy: Sekcja<KursProwadzacego[]>;
}

export type WidokPulpitu = "zakazany" | "awaria" | "pusty" | "dane";

/** Ile wierszy każdej listy pokazuje pulpit — resztę widać na osobnym ekranie. */
export const LIMIT_WIERSZY = 5;

export function rodzajAwarii(wyjatek: unknown): RodzajAwarii {
  if (wyjatek instanceof ApiError) {
    return wyjatek.status === 403 ? "zakazane" : "blad";
  }
  return "siec";
}

async function odczytaj<T, W>(zapytanie: () => Promise<T>, przetworz: (odpowiedz: T) => W): Promise<Sekcja<W>> {
  try {
    return { stan: "ok", dane: przetworz(await zapytanie()) };
  } catch (wyjatek) {
    return { stan: "awaria", rodzaj: rodzajAwarii(wyjatek) };
  }
}

export async function pobierzPulpit(): Promise<DanePulpitu> {
  const [pytania, grupa, kursy] = await Promise.all([
    odczytaj(
      () => fetchInstructorQuestions({ answered: false }),
      ({ data, meta }): PytaniaPulpitu => ({ liczba: unansweredCount(meta), wiersze: data }),
    ),
    odczytaj(
      () => api<InstructorGroup>("/instructor/group"),
      (grupaOdpowiedz) => grupaOdpowiedz,
    ),
    odczytaj(
      () => api<KursProwadzacego[]>("/instructor/courses"),
      (lista) => lista,
    ),
  ]);
  return { pytania, grupa, kursy };
}

/** Terminy jeszcze przed nami, od najbliższego. Minione nie są „do zrobienia”. */
export function nadchodzaceTerminy(terminy: InstructorSlot[], teraz: Date = new Date()): InstructorSlot[] {
  return terminy
    .filter((termin) => new Date(termin.starts_at).getTime() > teraz.getTime())
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
}

/**
 * Który widok pokazuje ekran. Wszystkie trzy odczyty odmówione (403) to
 * jedno „brak dostępu”; wszystkie trzy nieudane z innego powodu to jedna
 * awaria całego pulpitu; częściowa awaria zostaje widokiem `dane`, a sekcja
 * z błędem pokazuje własny komunikat.
 * „Nic do zrobienia” wymaga trzech udanych odczytów: bez pytań bez odpowiedzi
 * i bez nadchodzącego terminu superwizji.
 */
export function wybierzWidok(dane: DanePulpitu, teraz: Date = new Date()): WidokPulpitu {
  const sekcje = [dane.pytania, dane.grupa, dane.kursy];
  const awarie = sekcje.flatMap((sekcja) => (sekcja.stan === "awaria" ? [sekcja.rodzaj] : []));

  if (awarie.length === sekcje.length) {
    return awarie.every((rodzaj) => rodzaj === "zakazane") ? "zakazany" : "awaria";
  }
  if (dane.pytania.stan === "ok" && dane.grupa.stan === "ok" && dane.kursy.stan === "ok") {
    const brakPytan = dane.pytania.dane.liczba === 0;
    const brakTerminow = nadchodzaceTerminy(dane.grupa.dane.slots, teraz).length === 0;
    if (brakPytan && brakTerminow) return "pusty";
  }
  return "dane";
}

export function formatujTermin(znacznikIso: string): string {
  return formatujDateICzas(znacznikIso);
}

export function pelneImie(osoba: { first_name: string; last_name: string }): string {
  return `${osoba.first_name} ${osoba.last_name}`;
}

/** Polska odmiana rzeczownika przy liczbie: 1 · 2-4 (poza 12-14) · pozostałe. */
export function odmien(liczba: number, jeden: string, kilka: string, wiele: string): string {
  if (liczba === 1) return jeden;
  const reszta10 = liczba % 10;
  const reszta100 = liczba % 100;
  return reszta10 >= 2 && reszta10 <= 4 && !(reszta100 >= 12 && reszta100 <= 14) ? kilka : wiele;
}

/** Awaria całego pulpitu, w której żaden odczyt nie dotarł do serwera. */
export function awariaSieciowa(dane: DanePulpitu): boolean {
  return [dane.pytania, dane.grupa, dane.kursy].every(
    (sekcja) => sekcja.stan === "awaria" && sekcja.rodzaj === "siec",
  );
}

/** Skrót treści pytania do jednej linii podpowiedzi wiersza. */
export function skrocTresc(tresc: string, maksimum = 140): string {
  const jednaLinia = tresc.replace(/\s+/g, " ").trim();
  return jednaLinia.length <= maksimum ? jednaLinia : `${jednaLinia.slice(0, maksimum - 1).trimEnd()}…`;
}

type KafelPulpitu = Parameters<typeof StatRow>[0]["kafle"][number];

/** „4 października” z terminu — dzień i nazwa miesiąca bez roku; `null`, gdy znacznika nie da się odczytać. */
function dzienIMiesiac(znacznikIso: string): { dzien: number; miesiac: string } | null {
  const dopasowanie = /^(\d{1,2}) (\S+)/.exec(formatujDate(znacznikIso));
  return dopasowanie ? { dzien: Number(dopasowanie[1]), miesiac: dopasowanie[2] } : null;
}

/**
 * Podpis najbliższej superwizji: „18:00 online · zapisanych 6 z 8 miejsc”.
 * Godzina z terminu, miejsce z danych terminu (adres spotkania to „online”,
 * inny tekst zostaje jak jest, brak miejsca — bez słowa), liczby z zapisów
 * i limitu miejsc.
 */
export function podpisTerminuSuperwizji(termin: InstructorSlot): string {
  const godzina = /(\d{2}:\d{2})$/.exec(formatujDateICzas(termin.starts_at))?.[1];
  const miejsce = termin.location_or_link?.trim();
  const gdzie = !miejsce ? undefined : /^https?:\/\//i.test(miejsce) ? "online" : miejsce;
  const poczatek = [godzina, gdzie].filter(Boolean).join(" ");
  const miejsca = termin.seats_limit === 1 ? "miejsca" : "miejsc";
  const zapisy = `zapisanych ${termin.active_signups_count} z ${termin.seats_limit} ${miejsca}`;
  return poczatek ? `${poczatek} · ${zapisy}` : zapisy;
}

/**
 * Pasek liczb: dokładnie jeden kafel dominujący (pytania), każdy z odnośnikiem
 * do ekranu, na którym z liczbą można coś zrobić. Sekcja z awarią daje kafel
 * bez wartości („—”), nigdy zero. Czwarty kafel to najbliższa superwizja: dzień
 * i miesiąc jako liczba z nazwą miesiąca, pod nią podpis z godziną, miejscem i
 * zapisami.
 */
export function zbudujKafle(dane: DanePulpitu, teraz: Date = new Date()): KafelPulpitu[] {
  const termin = dane.grupa.stan === "ok" ? nadchodzaceTerminy(dane.grupa.dane.slots, teraz)[0] : undefined;
  const dzienMiesiac = termin ? dzienIMiesiac(termin.starts_at) : null;
  return [
    {
      id: "pulpit-pytania",
      etykieta: "Pytania bez odpowiedzi",
      wartosc: dane.pytania.stan === "ok" ? dane.pytania.dane.liczba : undefined,
      mianownik: dane.pytania.stan === "ok" ? odmien(dane.pytania.dane.liczba, "pytanie", "pytania", "pytań") : "pytań",
      dominujacy: true,
      href: ADRES_PYTAN,
    },
    {
      id: "pulpit-grupa",
      etykieta: "Osoby w grupie",
      wartosc: dane.grupa.stan === "ok" ? dane.grupa.dane.members.length : undefined,
      mianownik: dane.grupa.stan === "ok" ? odmien(dane.grupa.dane.members.length, "osoba", "osoby", "osób") : "osób",
      href: ADRES_GRUPY,
    },
    {
      id: "pulpit-kursy",
      etykieta: "Moje kursy",
      wartosc: dane.kursy.stan === "ok" ? dane.kursy.dane.length : undefined,
      mianownik: dane.kursy.stan === "ok" ? odmien(dane.kursy.dane.length, "kurs", "kursy", "kursów") : "kursów",
      href: ADRES_KURSOW,
    },
    {
      id: "pulpit-superwizja",
      etykieta: "Najbliższa superwizja",
      wartosc: dzienMiesiac?.dzien,
      mianownik: dzienMiesiac?.miesiac ?? "terminów",
      podpowiedz: termin
        ? podpisTerminuSuperwizji(termin)
        : dane.grupa.stan === "ok"
          ? "brak zaplanowanych terminów"
          : undefined,
      href: ADRES_GRUPY,
    },
  ];
}
