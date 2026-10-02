/**
 * Teksty i układ danych obu ekranów — czysta logika bez Reacta, żeby każde zdanie
 * dało się zmierzyć testem jednostkowym. Nic tu nie liczy rzeczy, których serwer nie
 * zwraca: liczniki i flagi `met` są pokazywane tak, jak przyszły.
 */
import { formatujDziesietny } from "../wspolne/formatuj-dziesietny";
import { odmien } from "../wspolne/odmiana";
import type { DocumentAvailableTypes, DocumentDto, DocumentType, WarunekCertyfikatu, WarunkiCertyfikatu } from "./dane";

/** Rodzaje dokumentów w stałej kolejności. */
export const RODZAJE_DOKUMENTOW: DocumentType[] = ["volunteer_agreement", "internship_certificate"];

export const ETYKIETY_RODZAJOW: Record<DocumentType, string> = {
  volunteer_agreement: "Porozumienie wolontariackie",
  internship_certificate: "Zaświadczenie o stażu",
};

/** Dopełniacz do zdań „Wygeneruj: …”, „Pobierz … (PDF)”. */
const RODZAJE_W_ZDANIU: Record<DocumentType, string> = {
  volunteer_agreement: "porozumienie wolontariackie",
  internship_certificate: "zaświadczenie o stażu",
};

const ETYKIETY_PROFILU: Record<string, string> = {
  first_name: "imię",
  last_name: "nazwisko",
  email: "adres e-mail",
  phone: "telefon",
  pesel: "PESEL",
  address_street: "ulica i numer",
  address_city: "miejscowość",
  address_zip: "kod pocztowy",
};

/* -------------------------------------------------------------------- */
/* Certyfikat                                                            */
/* -------------------------------------------------------------------- */

/** Ekran, z którego pochodzi licznik warunku. Warsztat stacjonarny nie ma własnego ekranu. */
const EKRAN_ZRODLOWY: Partial<Record<WarunekCertyfikatu["key"], { href: string; napis: string }>> = {
  courses: { href: "/panel/kursy", napis: "Otwórz kursy" },
  internship: { href: "/panel/staz", napis: "Otwórz dziennik stażu" },
  supervision: { href: "/panel/superwizja", napis: "Otwórz superwizje" },
};

export interface PozycjaListyBrakow {
  klucz: WarunekCertyfikatu["key"];
  tytul: string;
  /** Zdanie o stanie warunku, np. „Masz 41,5 z 72 godzin.”. */
  opis: string;
  spelniony: boolean;
  akcja?: { etykieta: string; etykietaDostepna: string; href: string };
}

function maLiczniki(warunek: WarunekCertyfikatu): warunek is WarunekCertyfikatu & { done: number | string; required: number | string } {
  return warunek.done !== undefined && warunek.done !== null && warunek.required !== undefined && warunek.required !== null;
}

function liczba(wartosc: number | string): string {
  return formatujDziesietny(String(wartosc));
}

/** „Masz 5 z 6.”; godziny stażu dostają jednostkę. Brak liczników to „brak danych”, nigdy zero. */
export function opisWarunku(warunek: WarunekCertyfikatu): string {
  if (warunek.key === "workshop") {
    return warunek.met ? "Warsztat zaliczony." : "Warsztat jeszcze niezaliczony.";
  }
  if (!maLiczniki(warunek)) return "Brak danych o postępie.";
  const jednostka = warunek.key === "internship" ? " godzin" : "";
  return `Masz ${liczba(warunek.done)} z ${liczba(warunek.required)}${jednostka}.`;
}

export function pozycjeListyBrakow(warunki: WarunkiCertyfikatu): PozycjaListyBrakow[] {
  return warunki.conditions.map((warunek) => {
    const opis = opisWarunku(warunek);
    const zrodlo = EKRAN_ZRODLOWY[warunek.key];
    return {
      klucz: warunek.key,
      tytul: warunek.label,
      opis,
      spelniony: warunek.met,
      akcja: zrodlo && {
        etykieta: zrodlo.napis,
        etykietaDostepna: `${zrodlo.napis}: ${warunek.label}. ${opis}`,
        href: zrodlo.href,
      },
    };
  });
}

/** „Spełniasz 2 warunki z 4.” — odmiana według liczby spełnionych, jak w słowniku interfejsu. */
export function zdanieOPostepie(warunki: WarunkiCertyfikatu): string {
  const razem = warunki.conditions.length;
  const spelnione = warunki.conditions.filter((warunek) => warunek.met).length;
  return `Spełniasz ${spelnione} ${odmien(spelnione, "warunek", "warunki", "warunków")} z ${razem}.`;
}

/** Wiersz „Zaliczone testy”; brak pola w odpowiedzi to „brak danych”, nie zero. */
export function zdanieOZaliczonychTestach(liczbaTestow: number | null | undefined): string {
  if (liczbaTestow === undefined || liczbaTestow === null) return "Brak danych o zaliczonych testach.";
  return `Masz ${liczbaTestow} ${odmien(liczbaTestow, "zaliczony test", "zaliczone testy", "zaliczonych testów")}.`;
}

/* -------------------------------------------------------------------- */
/* Dokumenty                                                             */
/* -------------------------------------------------------------------- */

export interface StanRodzaju {
  rodzaj: DocumentType;
  tytul: string;
  plakietka: { wariant: "ok" | "pending" | "warn"; tekst: string };
  /** Zdanie wyjaśniające, dlaczego rodzaj jest niedostępny; `null`, gdy nie ma czego wyjaśniać. */
  wyjasnienie: string | null;
  /** Przejście do uzupełnienia profilu, gdy tego brakuje. */
  doProfilu: boolean;
  mozeWygenerowac: boolean;
  wystawiony: boolean;
}

/** „Uzupełnij w profilu: imię, nazwisko i PESEL.” */
function zdanieOBrakachProfilu(pola: string[]): string {
  const nazwy = pola.map((pole) => ETYKIETY_PROFILU[pole] ?? pole);
  if (nazwy.length === 0) return "Uzupełnij dane w profilu.";
  if (nazwy.length === 1) return `Uzupełnij w profilu: ${nazwy[0]}.`;
  return `Uzupełnij w profilu: ${nazwy.slice(0, -1).join(", ")} i ${nazwy[nazwy.length - 1]}.`;
}

export function stanyRodzajow(dokumenty: DocumentDto[], dostepne: DocumentAvailableTypes | null): StanRodzaju[] {
  return RODZAJE_DOKUMENTOW.map((rodzaj) => {
    const stan = dostepne?.[rodzaj];
    const wystawiony = dokumenty.some((dokument) => dokument.type === rodzaj);
    const mozeWygenerowac = !wystawiony && stan?.available === true;
    const profil = !wystawiony && stan?.available === false && stan.reason === "profile_incomplete";
    const staz = !wystawiony && stan?.available === false && stan.reason === "conditions_not_met";

    let wyjasnienie: string | null = null;
    if (profil) wyjasnienie = zdanieOBrakachProfilu(stan?.missing_fields ?? []);
    else if (staz) {
      wyjasnienie = `Zaakceptowane godziny stażu: ${liczba(stan?.hours_accepted ?? "0")} z ${liczba(stan?.hours_required ?? "0")} wymaganych.`;
    }

    return {
      rodzaj,
      tytul: ETYKIETY_RODZAJOW[rodzaj],
      plakietka: wystawiony
        ? { wariant: "ok", tekst: "Wygenerowano" }
        : mozeWygenerowac
          ? { wariant: "pending", tekst: "Można wygenerować" }
          : { wariant: "warn", tekst: "Jeszcze niedostępny" },
      wyjasnienie,
      doProfilu: profil,
      mozeWygenerowac,
      wystawiony,
    };
  });
}

/** Pełna nazwa przycisku pobrania: co i w jakim formacie się pobierze. */
export function nazwaPobraniaDokumentu(dokument: DocumentDto): string {
  return `Pobierz ${RODZAJE_W_ZDANIU[dokument.type]} ${dokument.number} (plik PDF)`;
}

export function nazwaWydaniaDokumentu(rodzaj: DocumentType): string {
  return `Wygeneruj ${RODZAJE_W_ZDANIU[rodzaj]}`;
}
