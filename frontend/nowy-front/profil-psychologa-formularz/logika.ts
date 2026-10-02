/**
 * Teksty i reguły ekranu „Profil psychologa” — czysta logika bez Reacta, żeby każde zdanie dało się
 * zmierzyć testem jednostkowym. Nazwy stanów bierze z ekranów administracji
 * (`profile-kolejka/dane.ts`), więc jeden stan ma jedną nazwę na wszystkich ekranach.
 */
import { ApiError } from "@/lib/api/klient";
import { odmien } from "../wspolne/odmiana";
import { formatujDate } from "../wspolne/daty";
import { plakietkaStanu, type WariantPlakietki } from "../profile-kolejka/dane";
import type { FormularzWniosku, ProfileDocumentType, Wniosek } from "./dane";

export const ETYKIETY_ZALACZNIKOW: Record<ProfileDocumentType, string> = {
  dyplom: "Dyplom",
  niekaralnosc: "Zaświadczenie o niekaralności",
  inne: "Inny dokument",
};

export const TYPY_ZALACZNIKOW = Object.keys(ETYKIETY_ZALACZNIKOW) as ProfileDocumentType[];

/** Nazwy braków z odpowiedzi serwera (`reason.missing`) i z lokalnego sprawdzenia. */
const ETYKIETY_BRAKOW: Record<string, string> = {
  specializations: "specjalizacje",
  approach: "nurt terapeutyczny",
  city: "miasto",
  documents: "dyplom",
  consent: "zgoda na publikację",
};

/** Klucze braków w stałej kolejności — tej samej, w której sprawdza je serwer. */
const KOLEJNOSC_BRAKOW = ["specializations", "approach", "city", "documents", "consent"] as const;

/* -------------------------------------------------------------------- */
/* Stan wniosku                                                          */
/* -------------------------------------------------------------------- */

export type RodzajStanu = "brak" | "draft" | "submitted" | "returned" | "accepted" | "published" | "withdrawn" | "nieznany";

/** Serwer zwraca pusty wniosek `draft` bez dat, gdy osoba jeszcze niczego nie zapisała. */
export function rodzajStanu(wniosek: Wniosek): RodzajStanu {
  if (wniosek.status === "draft" && wniosek.created_at === null) return "brak";
  switch (wniosek.status) {
    case "draft":
    case "submitted":
    case "returned":
    case "accepted":
    case "published":
    case "withdrawn":
      return wniosek.status;
    default:
      return "nieznany";
  }
}

export interface OpisStanu {
  /** Nazwa stanu — ta sama co na ekranach administracji (dla „brak” własna, bo administracja go nie ma). */
  nazwa: string;
  wariant: WariantPlakietki;
  /** Co ten stan znaczy dla osoby. */
  znaczy: string;
  /** Co dzieje się dalej. */
  dalej: string;
}

const OPISY: Record<Exclude<RodzajStanu, "brak" | "nieznany">, { znaczy: string; dalej: string }> = {
  draft: {
    znaczy: "Wniosek jest zapisany jako wersja robocza. Nikt go jeszcze nie widzi.",
    dalej: "Uzupełnij dane, dodaj dyplom i zaznacz zgodę na publikację. Potem wyślij wniosek do sprawdzenia.",
  },
  submitted: {
    znaczy: "Wniosek czeka na decyzję. Na czas sprawdzania nie możesz go zmieniać.",
    dalej: "Gdy zespół podejmie decyzję, dostaniesz powiadomienie. Do tego czasu możesz wycofać zgodę na publikację.",
  },
  returned: {
    znaczy: "Wniosek wymaga poprawek.",
    dalej: "Przeczytaj uwagi, popraw dane i wyślij wniosek do sprawdzenia jeszcze raz.",
  },
  accepted: {
    znaczy: "Wniosek został zatwierdzony. Dane są zablokowane.",
    dalej: "Zgodę na publikację możesz wycofać w każdej chwili.",
  },
  published: {
    znaczy: "Profil jest opublikowany. Dane są zablokowane.",
    dalej: "Zgodę na publikację możesz wycofać w każdej chwili.",
  },
  withdrawn: {
    znaczy: "Zgoda na publikację została wycofana. Wniosek jest zablokowany.",
    dalej: "Nie możesz już go zmieniać ani wysyłać ponownie.",
  },
};

export function opisStanu(rodzaj: RodzajStanu): OpisStanu {
  if (rodzaj === "brak") {
    return {
      nazwa: "Nie rozpoczęto",
      wariant: "neutral",
      znaczy: "Nie masz jeszcze wniosku o wpis do bazy psychologów Fundacji.",
      dalej: "Uzupełnij dane poniżej i zapisz je. Gdy wniosek będzie kompletny, wyślesz go do sprawdzenia.",
    };
  }
  if (rodzaj === "nieznany") {
    return { nazwa: "Stan nieznany", wariant: "neutral", znaczy: "Nie rozpoznajemy stanu wniosku.", dalej: "Odśwież stronę albo wróć za chwilę." };
  }
  const { etykieta, wariant } = plakietkaStanu(rodzaj);
  return { nazwa: etykieta, wariant, ...OPISY[rodzaj] };
}

/** Pola i dodawanie załączników są dostępne tylko w wersji roboczej i po odesłaniu do poprawki. */
export function czyEdytowalny(rodzaj: RodzajStanu): boolean {
  return rodzaj === "brak" || rodzaj === "draft" || rodzaj === "returned";
}

/** Zgodę można wycofać, gdy wniosek czeka, wrócił do poprawki albo został zatwierdzony. */
export function czyMoznaWycofac(rodzaj: RodzajStanu): boolean {
  return rodzaj === "submitted" || rodzaj === "returned" || rodzaj === "accepted";
}

/* -------------------------------------------------------------------- */
/* Braki przed wysłaniem                                                 */
/* -------------------------------------------------------------------- */

/** Braki zapisanego wniosku: to samo sprawdzenie, które przy wysłaniu robi serwer. */
export function brakiWniosku(wniosek: Wniosek, zgoda: boolean): string[] {
  const braki: string[] = [];
  if ((wniosek.specializations ?? []).length === 0) braki.push("specializations");
  if (!(wniosek.approach ?? "").trim()) braki.push("approach");
  if (!(wniosek.city ?? "").trim()) braki.push("city");
  if (!wniosek.documents.some((dokument) => dokument.type === "dyplom")) braki.push("documents");
  if (!zgoda) braki.push("consent");
  return KOLEJNOSC_BRAKOW.filter((klucz) => braki.includes(klucz));
}

/** „Brakuje 2 elementów: dyplom, zgoda na publikację.” — nieznany klucz wraca bez zmian. */
export function zdanieOBrakach(klucze: string[]): string {
  const nazwy = klucze.map((klucz) => ETYKIETY_BRAKOW[klucz] ?? klucz);
  return `Brakuje ${nazwy.length} ${odmien(nazwy.length, "elementu", "elementów", "elementów")}: ${nazwy.join(", ")}.`;
}

/* -------------------------------------------------------------------- */
/* Załączniki                                                            */
/* -------------------------------------------------------------------- */

export function zdanieOZalacznikach(liczba: number): string {
  if (liczba === 0) return "Nie dodano jeszcze żadnych załączników.";
  return `Masz ${liczba} ${odmien(liczba, "załącznik", "załączniki", "załączników")}.`;
}

export function opisZalacznika(dokument: { type: ProfileDocumentType; uploaded_at: string }): string {
  return `${ETYKIETY_ZALACZNIKOW[dokument.type] ?? dokument.type} · dodano ${formatujDate(dokument.uploaded_at)}`;
}

/* -------------------------------------------------------------------- */
/* Błędy serwera                                                         */
/* -------------------------------------------------------------------- */

/** Błąd pola z odpowiedzi 422: dokładny klucz albo błąd pozycji listy (`specializations.0`). */
export function bladPola(bledy: Record<string, string[]>, klucz: string): string | undefined {
  const dokladny = bledy[klucz]?.[0];
  if (dokladny) return dokladny;
  const pozycja = Object.keys(bledy).find((nazwa) => nazwa.startsWith(`${klucz}.`));
  return pozycja ? bledy[pozycja]?.[0] : undefined;
}

export function komunikatBledu(blad: unknown, zastepczy: string): string {
  return blad instanceof ApiError ? blad.message : zastepczy;
}

/** Zmiana względem zapisanego wniosku: tekst z pól różny od tego, co jest zapisane. */
export function czyZmieniony(formularz: FormularzWniosku, zapisany: FormularzWniosku): boolean {
  return (
    formularz.specjalizacje !== zapisany.specjalizacje ||
    formularz.nurt !== zapisany.nurt ||
    formularz.miasto !== zapisany.miasto ||
    formularz.opis !== zapisany.opis
  );
}
