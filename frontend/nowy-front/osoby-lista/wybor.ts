import { ApiError } from "@/lib/api/klient";
import {
  MAX_PEOPLE_AT_ONCE,
  type SupervisorAssignmentResult,
  type SupervisorAssignmentToManyResponse,
} from "@/lib/api/przypisanie-prowadzacego";
import { odmien } from "../wspolne/odmiana";
import type { WierszOsoby, WybranaOsoba } from "./dane";

/**
 * Zaznaczenie osób do przypisania prowadzącego i zdania, które je opisują.
 * Zaznaczenie trzyma osoby po identyfikatorze, więc przetrwa zmianę filtra i
 * strony; czyści je dopiero „Wyczyść wybór” albo udane przypisanie.
 */

export type Wybor = ReadonlyMap<number, WybranaOsoba>;

export const PUSTY_WYBOR: Wybor = new Map();

/** Adres istniejącego dziennika działań administracji. */
export const SCIEZKA_DZIENNIKA = "/admin/dziennik";

export function przelacz(wybor: Wybor, osoba: WybranaOsoba, zaznaczona: boolean): Wybor {
  const nowy = new Map(wybor);
  if (zaznaczona) nowy.set(osoba.id, osoba);
  else nowy.delete(osoba.id);
  return nowy;
}

/** Osoby z bieżącej strony, które można zaznaczyć. */
export function doWyboruNaStronie(wiersze: WierszOsoby[]): WybranaOsoba[] {
  return wiersze.filter((wiersz) => wiersz.doWyboru).map((wiersz) => wiersz.wybor);
}

/** Czy zaznaczone są wszystkie osoby do wyboru z tej strony (i jest choć jedna). */
export function wszystkieNaStronie(wybor: Wybor, wiersze: WierszOsoby[]): boolean {
  const osoby = doWyboruNaStronie(wiersze);
  return osoby.length > 0 && osoby.every((osoba) => wybor.has(osoba.id));
}

/** „Zaznacz wszystkie na tej stronie”: dokłada albo zdejmuje osoby tej strony, resztę zostawia. */
export function zaznaczStrone(wybor: Wybor, wiersze: WierszOsoby[], zaznaczona: boolean): Wybor {
  return doWyboruNaStronie(wiersze).reduce((wynik, osoba) => przelacz(wynik, osoba, zaznaczona), wybor);
}

/** Wybór ponad limit jednego żądania — przycisk główny pokazuje wtedy brak, nie wysyła. */
export function ponadLimit(wybor: Wybor): number {
  return Math.max(0, wybor.size - MAX_PEOPLE_AT_ONCE);
}

export function zdanieLimitu(wybor: Wybor): string | null {
  const nadmiar = ponadLimit(wybor);
  if (nadmiar === 0) return null;
  return `Jednym przypisaniem obejmiesz najwyżej ${MAX_PEOPLE_AT_ONCE} osób. Odznacz ${nadmiar} ${odmien(nadmiar, "osobę", "osoby", "osób")}.`;
}

/** Osoby, u których wybrany prowadzący zastąpi innego, dotychczasowego. */
export function liczbaZmian(wybor: Wybor, idProwadzacego: number | null): number {
  if (idProwadzacego === null) return 0;
  let licznik = 0;
  for (const osoba of wybor.values()) {
    if (osoba.prowadzacy !== null && osoba.prowadzacy.id !== idProwadzacego) licznik += 1;
  }
  return licznik;
}

/**
 * Zdanie ostrzegające o zmianie prowadzącego — tylko gdy zmiana dotyczy
 * choć jednej osoby. Liczba pojedyncza ma własne zdanie („z tą osobą”).
 */
export function zdanieZmiany(wybor: Wybor, idProwadzacego: number | null): string | null {
  const zmiany = liczbaZmian(wybor, idProwadzacego);
  if (zmiany === 0) return null;
  if (zmiany === 1) {
    return "U 1 osoby zmieni się prowadzący. Poprzedni prowadzący straci dostęp do rozmowy z tą osobą; zobaczy ona starą rozmowę tylko do odczytu.";
  }
  return `U ${zmiany} ${odmien(zmiany, "osoby", "osób", "osób")} zmieni się prowadzący. Poprzedni prowadzący straci dostęp do rozmowy z tymi osobami; każda z nich zobaczy starą rozmowę tylko do odczytu.`;
}

/** Zdanie przyczyny, gdy w oknie nie wybrano prowadzącego. */
export const BRAK_WYBORU_PROWADZACEGO = "Wybierz prowadzącego.";

export interface NieudanaOsoba {
  id: number;
  nazwa: string;
  powod: string;
}

export interface WynikPrzypisania {
  /** Osoby, które mają teraz wybranego prowadzącego (przypisane i bez zmian). */
  udane: number;
  /** Osoby, które już miały tego prowadzącego. */
  bezZmian: number;
  wszystkie: number;
  nieudane: NieudanaOsoba[];
}

/** Powód odmowy prostym zdaniem — kod serwera nie trafia na ekran. */
export function powodNiepowodzenia(wynik: SupervisorAssignmentResult): string {
  if (wynik.result === "not_found") return "nie znaleziono tej osoby — konto mogło zostać usunięte";
  if (wynik.reason === "not_assignable") {
    return "prowadzącego można przypisać tylko aktywnemu kontu z rolą „Wolontariusz”";
  }
  return "serwer odmówił przypisania";
}

export function wynikPrzypisania(odpowiedz: SupervisorAssignmentToManyResponse, wybor: Wybor): WynikPrzypisania {
  const nieudane = odpowiedz.results
    .filter((wynik) => wynik.result === "refused" || wynik.result === "not_found")
    .map((wynik) => ({
      id: wynik.user_id,
      nazwa: wybor.get(wynik.user_id)?.nazwa ?? `Osoba nr ${wynik.user_id}`,
      powod: powodNiepowodzenia(wynik),
    }));
  const bezZmian = odpowiedz.results.filter((wynik) => wynik.result === "unchanged").length;
  return {
    udane: odpowiedz.results.length - nieudane.length,
    bezZmian,
    wszystkie: odpowiedz.results.length,
    nieudane,
  };
}

/** „Przypisano X z N osób.” — dopełniacz po „z”: 1 osoby, 2 osób. */
export function zdanieWyniku(wynik: WynikPrzypisania): string {
  return `Przypisano ${wynik.udane} z ${wynik.wszystkie} ${odmien(wynik.wszystkie, "osoby", "osób", "osób")}.`;
}

export function zdanieBezZmian(wynik: WynikPrzypisania): string | null {
  if (wynik.bezZmian === 0) return null;
  return `${wynik.bezZmian} z nich ${odmien(wynik.bezZmian, "miała", "miały", "miało")} już tego prowadzącego.`;
}

/** Po przypisaniu w zaznaczeniu zostają wyłącznie osoby, których nie udało się przypisać. */
export function wyborPoPrzypisaniu(wybor: Wybor, wynik: WynikPrzypisania): Wybor {
  const zostaja = new Set(wynik.nieudane.map((osoba) => osoba.id));
  return new Map(Array.from(wybor).filter(([id]) => zostaja.has(id)));
}

/**
 * `odmowa` — serwer odrzucił całe żądanie walidacją (422), więc nikomu nie
 * przypisano prowadzącego; `serwer` — odpowiedź nie dotarła albo była błędem,
 * więc stan listy jest niepewny.
 */
export type RodzajBleduPrzypisania = "brak-uprawnien" | "odmowa" | "serwer";

export function rodzajBleduPrzypisania(wyjatek: unknown): RodzajBleduPrzypisania {
  if (wyjatek instanceof ApiError && (wyjatek.status === 401 || wyjatek.status === 403)) return "brak-uprawnien";
  if (wyjatek instanceof ApiError && wyjatek.status === 422) return "odmowa";
  return "serwer";
}

/** Zdanie odmowy walidacji: pierwszy komunikat pola z koperty błędu (po polsku), inaczej komunikat ogólny. */
export function zdanieOdmowy(wyjatek: unknown): string {
  if (wyjatek instanceof ApiError) {
    const pierwszy = Object.values(wyjatek.errors ?? {}).flat()[0];
    if (pierwszy !== undefined && pierwszy.trim() !== "") return pierwszy;
    if (wyjatek.message.trim() !== "") return wyjatek.message;
  }
  return "Serwer odrzucił przypisanie.";
}
