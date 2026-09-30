import { ApiError } from "@/lib/api/klient";
import type { KolejkaPulpitu, LicznikiPulpitu, PulpitAdministracji } from "./dane";

/** Nazwy spraw po polsku; klucze to kody kolejek z odpowiedzi serwera. */
export const NAZWY_SPRAW: Record<string, string> = {
  applications: "Zgłoszenia rekrutacyjne",
  internship_entries: "Dyżury czekające na decyzję",
  profiles: "Profile prowadzących do decyzji",
  questions: "Pytania bez odpowiedzi",
};

export const NAZWA_INNYCH_SPRAW = "Inne sprawy";

export const TEKST_BRAK_SPRAW = "Brak spraw do decyzji";

const KAFLE: { klucz: keyof LicznikiPulpitu; id: string; etykieta: string; mianownik: string }[] = [
  { klucz: "participants", id: "pulpit-uczestnicy", etykieta: "Uczestnicy w programie", mianownik: "osób" },
  { klucz: "completed", id: "pulpit-ukonczenia", etykieta: "Ukończenia programu", mianownik: "osób" },
  { klucz: "certificates", id: "pulpit-certyfikaty", etykieta: "Wydane certyfikaty", mianownik: "certyfikatów" },
];

export interface KafelPulpitu {
  id: string;
  etykieta: string;
  wartosc: number;
  mianownik: string;
}

export interface WierszSprawy {
  id: string;
  nazwa: string;
  liczba: number;
  /** Adres wewnętrzny z odpowiedzi serwera albo `null`, gdy adres nie jest ścieżką wewnątrz aplikacji. */
  link: string | null;
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
 * Cel przycisku „Otwórz sprawy”: kolejka z największą liczbą spraw czekających
 * na decyzję (przy remisie pierwsza w odpowiedzi), o ile jej adres jest
 * ścieżką wewnętrzną. Adresu nie budujemy — bierzemy `link` z odpowiedzi.
 */
export function zbudujWidok(dane: PulpitAdministracji): WidokPulpitu {
  const kafle = KAFLE.map(({ klucz, id, etykieta, mianownik }) => ({
    id,
    etykieta,
    wartosc: dane.counters[klucz],
    mianownik,
  }));

  const wiersze = dane.queues.map((kolejka) => ({
    id: kolejka.key,
    nazwa: NAZWY_SPRAW[kolejka.key] ?? NAZWA_INNYCH_SPRAW,
    liczba: kolejka.count,
    link: adresWewnetrzny(kolejka.link),
  }));

  const razem = wiersze.reduce((suma, wiersz) => suma + wiersz.liczba, 0);
  const brakSpraw = razem === 0;

  let cel: CelSpraw | null = null;
  for (const wiersz of wiersze) {
    if (wiersz.liczba > 0 && wiersz.link !== null && (cel === null || wiersz.liczba > cel.liczba)) {
      cel = { nazwa: wiersz.nazwa, liczba: wiersz.liczba, link: wiersz.link };
    }
  }

  let powodBrakuCelu: string | null = null;
  if (cel === null) {
    if (wiersze.length === 0) {
      powodBrakuCelu = "Odpowiedź serwera nie zawiera spraw do otwarcia.";
    } else if (brakSpraw) {
      powodBrakuCelu = `${TEKST_BRAK_SPRAW}.`;
    } else {
      powodBrakuCelu = "Adres spraw z odpowiedzi serwera jest nieprawidłowy.";
    }
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
