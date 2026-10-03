import { ApiError } from "@/lib/api/klient";
import { odmien } from "../wspolne/odmiana";
import type { KolejkaPulpitu, LicznikiPulpitu, PulpitAdministracji } from "./dane";

/** Nazwy spraw po polsku; klucze to kody kolejek z odpowiedzi serwera. */
export const NAZWY_SPRAW: Record<string, string> = {
  applications: "Zgłoszenia rekrutacyjne",
  internship_entries: "Dyżury czekające na decyzję",
  profiles: "Wnioski o profil psychologa",
  questions: "Pytania bez odpowiedzi",
};

export const NAZWA_INNYCH_SPRAW = "Inne sprawy";

/**
 * Kolejka, której administracja nie otwiera: pytania czyta i odpowiada na nie
 * prowadzący, a trasa `/prowadzacy/pytania` ma bramkę roli prowadzącego —
 * administracja dostałaby tam odmowę. Wiersz tej kolejki zostaje z liczbą, bez
 * akcji, z krótką adnotacją. Reguła idzie po kluczu kolejki, nie po treści
 * adresu: adres z odpowiedzi serwera nadal przychodzi, ale ekran go dla tego
 * klucza nie używa.
 */
export const KLUCZ_KOLEJKI_BEZ_AKCJI = "questions";

/** Adnotacja pod tytułem wiersza kolejki bez akcji. */
export const PODLINIA_KOLEJKI_BEZ_AKCJI = "odpowiada prowadzący";

/** Tytuł listy spraw na pulpicie (nagłówek i nazwa regionu). */
export const TYTUL_LISTY = "Co czeka na decyzję";

export const TEKST_BRAK_SPRAW = "Brak spraw do decyzji";

/** Powód niedostępności przycisku „Otwórz sprawy” (pod nagłówkiem, opisuje przycisk). */
export const POWOD_BRAKU_SPRAW = "Żadna sprawa nie czeka na decyzję.";

/** Formy jednostki przy liczbie: 1 · 2-4 (poza 12-14) · pozostałe (w tym 0). */
type FormyJednostki = readonly [jeden: string, kilka: string, wiele: string];

export const FORMY_SPRAW: FormyJednostki = ["sprawa", "sprawy", "spraw"];

const FORMY_OSOB: FormyJednostki = ["osoba", "osoby", "osób"];
const FORMY_CERTYFIKATOW: FormyJednostki = ["certyfikat", "certyfikaty", "certyfikatów"];

/** Jednostka odmieniona przez liczbę, np. `jednostka(3, FORMY_OSOB)` daje „osoby”. */
export function jednostka(liczba: number, [jeden, kilka, wiele]: FormyJednostki): string {
  return odmien(liczba, jeden, kilka, wiele);
}

/** Opisy pod liczbami: jedna krótka linia, bez danych, których odpowiedź serwera nie niesie. */
export const OPIS_KAFLA_SPRAW = "w kolejkach niżej";

const KAFLE: {
  klucz: keyof LicznikiPulpitu;
  id: string;
  etykieta: string;
  formy: FormyJednostki;
  opis: string;
}[] = [
  { klucz: "participants", id: "pulpit-uczestnicy", etykieta: "Uczestnicy w programie", formy: FORMY_OSOB, opis: "z aktywnym kontem" },
  { klucz: "completed", id: "pulpit-ukonczenia", etykieta: "Ukończenia programu", formy: FORMY_OSOB, opis: "program zakończony" },
  { klucz: "certificates", id: "pulpit-certyfikaty", etykieta: "Wydane certyfikaty", formy: FORMY_CERTYFIKATOW, opis: "wydane łącznie" },
];

export interface KafelPulpitu {
  id: string;
  etykieta: string;
  wartosc: number;
  mianownik: string;
  /** Jedna linia opisu pod liczbą. */
  podpowiedz: string;
}

export interface WierszSprawy {
  id: string;
  nazwa: string;
  liczba: number;
  /** Adres wewnętrzny z odpowiedzi serwera albo `null`, gdy adres nie jest ścieżką wewnątrz aplikacji. */
  link: string | null;
  /** Prawda, gdy wiersz ma akcję „Otwórz”; fałsz dla kolejki, którą administracja tylko widzi (`KLUCZ_KOLEJKI_BEZ_AKCJI`). */
  otwierany: boolean;
  /** Adnotacja pod tytułem wiersza albo `null`. */
  podlinia: string | null;
}

export interface CelSpraw {
  nazwa: string;
  liczba: number;
  link: string;
}

export interface WidokPulpitu {
  kafle: KafelPulpitu[];
  wiersze: WierszSprawy[];
  razem: number;
  /** Prawda, gdy żadna sprawa nie czeka na decyzję (albo odpowiedź nie niesie spraw). */
  brakSpraw: boolean;
  /** Sprawy, które otwiera przycisk główny; `null`, gdy nie ma dokąd przejść. */
  cel: CelSpraw | null;
  powodBrakuCelu: string | null;
}

function liczbaCalkowita(wartosc: unknown): number | null {
  if (typeof wartosc === "number") {
    return Number.isInteger(wartosc) && wartosc >= 0 ? wartosc : null;
  }
  if (typeof wartosc === "string" && /^\d+$/.test(wartosc)) {
    return Number(wartosc);
  }
  return null;
}

/**
 * Adres z odpowiedzi jest używany tylko wtedy, gdy jest ścieżką wewnątrz
 * aplikacji: zaczyna się od jednego `/`, bez `//`, odwrotnego ukośnika i
 * białych znaków. Inne schematy i adresy zewnętrzne nigdy nie stają się celem.
 */
export function adresWewnetrzny(link: unknown): string | null {
  if (typeof link !== "string") return null;
  if (!link.startsWith("/") || link.startsWith("//")) return null;
  if (/[\\\s]/.test(link)) return null;
  for (let i = 0; i < link.length; i += 1) {
    if (link.charCodeAt(i) < 32) return null;
  }
  return link;
}

/**
 * Sprawdza kształt odpowiedzi `GET /admin/dashboard` (`data.counters` i
 * `data.queues`). Zwraca `null`, gdy kształt się nie zgadza — ekran pokazuje
 * wtedy błąd zamiast zmyślać zera.
 */
export function odczytajPulpit(surowe: unknown): PulpitAdministracji | null {
  if (typeof surowe !== "object" || surowe === null) return null;
  const { counters, queues } = surowe as { counters?: unknown; queues?: unknown };
  if (typeof counters !== "object" || counters === null || !Array.isArray(queues)) return null;

  const licznik = counters as Record<string, unknown>;
  const uczestnicy = liczbaCalkowita(licznik.participants);
  const ukonczenia = liczbaCalkowita(licznik.completed);
  const certyfikaty = liczbaCalkowita(licznik.certificates);
  if (uczestnicy === null || ukonczenia === null || certyfikaty === null) return null;

  const kolejki: KolejkaPulpitu[] = [];
  for (const element of queues) {
    if (typeof element !== "object" || element === null) return null;
    const { key, count, link } = element as Record<string, unknown>;
    const liczba = liczbaCalkowita(count);
    if (typeof key !== "string" || liczba === null || typeof link !== "string") return null;
    kolejki.push({ key, count: liczba, link });
  }

  return {
    counters: { participants: uczestnicy, completed: ukonczenia, certificates: certyfikaty },
    queues: kolejki,
  };
}

/**
 * Adres ekranu „Sprawy” (wszystkie rodzaje spraw w jednej kolejce). Ten sam
 * adres ma pozycja „Sprawy” w menu administracji — przed przełączeniem
 * i po nim (`lib/przelaczenie/grupy.ts`, grupa `sprawy`).
 */
export const ADRES_SPRAW = "/admin/sprawy";

/**
 * Cel przycisku „Otwórz sprawy”: zawsze ekran „Sprawy” ze wszystkimi
 * rodzajami spraw, nigdy adres jednej kolejki z odpowiedzi serwera (adres
 * kolejki zgłoszeń prowadzi do listy osób). Przycisk jest niedostępny tylko
 * wtedy, gdy żadna sprawa otwierana przez administrację nie czeka — kolejka
 * pytań (`KLUCZ_KOLEJKI_BEZ_AKCJI`) się nie liczy, bo „Sprawy” jej nie pokazują.
 */
export function zbudujWidok(dane: PulpitAdministracji): WidokPulpitu {
  const kaflaLicznikow = KAFLE.map(({ klucz, id, etykieta, formy, opis }) => ({
    id,
    etykieta,
    wartosc: dane.counters[klucz],
    mianownik: jednostka(dane.counters[klucz], formy),
    podpowiedz: opis,
  }));

  const wiersze = dane.queues.map((kolejka) => ({
    id: kolejka.key,
    nazwa: NAZWY_SPRAW[kolejka.key] ?? NAZWA_INNYCH_SPRAW,
    liczba: kolejka.count,
    link: adresWewnetrzny(kolejka.link),
    otwierany: kolejka.key !== KLUCZ_KOLEJKI_BEZ_AKCJI,
    podlinia: kolejka.key === KLUCZ_KOLEJKI_BEZ_AKCJI ? PODLINIA_KOLEJKI_BEZ_AKCJI : null,
  }));

  const razem = wiersze.reduce((suma, wiersz) => suma + wiersz.liczba, 0);
  const brakSpraw = razem === 0;

  // Pierwszy kafel to suma kolejek z listy „Co czeka na decyzję” — ta sama liczba
  // co „Razem” w stopce listy, bez drugiej reguły liczenia.
  const kafle: KafelPulpitu[] = [
    {
      id: "pulpit-sprawy",
      etykieta: "Czekają na decyzję",
      wartosc: razem,
      mianownik: jednostka(razem, FORMY_SPRAW),
      podpowiedz: OPIS_KAFLA_SPRAW,
    },
    ...kaflaLicznikow,
  ];

  const doOtwarcia = wiersze
    .filter((wiersz) => wiersz.otwierany)
    .reduce((suma, wiersz) => suma + wiersz.liczba, 0);
  let cel: CelSpraw | null = null;
  let powodBrakuCelu: string | null = null;
  if (doOtwarcia === 0) {
    powodBrakuCelu = POWOD_BRAKU_SPRAW;
  } else {
    cel = { nazwa: "Sprawy", liczba: doOtwarcia, link: ADRES_SPRAW };
  }

  return { kafle, wiersze, razem, brakSpraw: wiersze.length === 0 || brakSpraw, cel, powodBrakuCelu };
}

export type RodzajBleduPulpitu = "brak-uprawnien" | "blad";

/** 401 i 403 to brak dostępu; wszystko inne (sieć, 5xx, zły kształt) to błąd odczytu. */
export function rodzajBledu(wyjatek: unknown): RodzajBleduPulpitu {
  if (wyjatek instanceof ApiError && (wyjatek.status === 401 || wyjatek.status === 403)) {
    return "brak-uprawnien";
  }
  return "blad";
}
