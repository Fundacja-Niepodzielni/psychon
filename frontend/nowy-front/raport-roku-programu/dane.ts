import { ApiError } from "@/lib/api/klient";
import {
  downloadLiczbyDlaGrantodawcy,
  downloadZestawienieRokuProgramu,
  fetchRaportRokuProgramu,
  type OkresRaportu,
  type OsobaZestawienia,
  type RaportRokuProgramu,
} from "@/lib/api/raport-roku-programu";

/**
 * Dane ekranu „Raport roku programu” — `GET /admin/report`
 * (`backend/routes/api/h20.php`, `ReportSummary::build()`) i dwa pliki:
 * zestawienie imienne (`export.csv?uklad=zestawienie`) oraz same liczby dla
 * grantodawcy (`report/grantor/export.csv`). Kto może czytać raport,
 * rozstrzyga serwer (grupa administracji); ekran pokazuje jego odmowę.
 *
 * Odczyt biegnie z przeglądarki (Bearer z sesji), jak na liście osób.
 */

export type { OkresRaportu, OsobaZestawienia, RaportRokuProgramu };

export function pobierzRaport(okres: OkresRaportu): Promise<RaportRokuProgramu | null> {
  return fetchRaportRokuProgramu(okres).then(odczytajRaport);
}

export function pobierzZestawienie(okres: OkresRaportu): Promise<void> {
  return downloadZestawienieRokuProgramu(okres);
}

export function pobierzLiczbyDlaGrantodawcy(okres: OkresRaportu): Promise<void> {
  return downloadLiczbyDlaGrantodawcy(okres);
}

function jestObiektem(wartosc: unknown): wartosc is Record<string, unknown> {
  return typeof wartosc === "object" && wartosc !== null && !Array.isArray(wartosc);
}

/**
 * Odpowiedź z blokami roku programu albo `null`, gdy ich nie ma (zaplecze sprzed
 * tej zmiany) — ekran pokazuje wtedy błąd zamiast liczb zmyślonych z braku danych.
 */
export function odczytajRaport(odpowiedz: unknown): RaportRokuProgramu | null {
  if (!jestObiektem(odpowiedz)) return null;
  const { edition, period, program, students, people } = odpowiedz;
  if (!jestObiektem(edition) || typeof edition.name !== "string") return null;
  if (!jestObiektem(program) || typeof program.active !== "number" || typeof program.hours_accepted_total !== "string") return null;
  if (!jestObiektem(students) || typeof students.active !== "number") return null;
  if (!Array.isArray(people)) return null;
  return {
    edition: edition as unknown as RaportRokuProgramu["edition"],
    period: jestObiektem(period)
      ? (period as unknown as RaportRokuProgramu["period"])
      : { from: null, to: null },
    program: program as unknown as RaportRokuProgramu["program"],
    students: students as unknown as RaportRokuProgramu["students"],
    people: people.filter(jestObiektem) as unknown as OsobaZestawienia[],
  };
}

export type RodzajBledu = "brak-dostepu" | "siec" | "blad" | "zly-okres";

/** Rodzaj błędu odczytu: odmowa roli, zły zakres dat (422), brak połączenia albo inna odpowiedź serwera. */
export function rodzajBledu(wyjatek: unknown): RodzajBledu {
  if (!(wyjatek instanceof ApiError)) return "siec";
  if (wyjatek.status === 401 || wyjatek.status === 403) return "brak-dostepu";
  if (wyjatek.status === 422) return "zly-okres";
  return "blad";
}

/** Zdanie serwera dla złego zakresu dat — z pola `to` albo `from`, inaczej ogólne. */
export function zdanieZlegoOkresu(wyjatek: unknown): string {
  if (wyjatek instanceof ApiError) {
    const zPola = wyjatek.errors?.to?.[0] ?? wyjatek.errors?.from?.[0];
    if (zPola) return zPola;
  }
  return "Popraw daty okresu.";
}

/** Zdanie błędu pobrania pliku — komunikat serwera albo zdanie o internecie. */
export function zdanieBleduPobrania(wyjatek: unknown): string {
  return wyjatek instanceof ApiError ? wyjatek.message : "Sprawdź połączenie z internetem i spróbuj jeszcze raz.";
}
