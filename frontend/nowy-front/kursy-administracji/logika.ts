import { ApiError } from "@/lib/api/klient";
import type {
  KolumnaRecordList,
  KomorkaRecordList,
  WierszRecordList,
} from "@/design-system/organizmy/RecordList/RecordList";
import type { WierszDataTable } from "@/design-system/organizmy/DataTable/DataTable";
import { COURSE_STATE_LABELS, COURSE_TYPE_LABELS, type ReorderImpactRow } from "@/lib/h08/types";
import { odmien } from "../wspolne/odmiana";
import type { KursAdministracji } from "./dane";

/**
 * Logika ekranu „Kursy” (administracja) bez Reacta: wiersze listy, identyfikator
 * z tytułu, przesuwanie w kolejności ścieżki, klasyfikacja błędów. Etykiety typu
 * to słownik `lib/h08/types` — ten sam co na starym ekranie.
 */

/** Adres ekranu kursu (stary ekran szczegółu, ta sama trasa produktu). */
export function adresKursu(id: number): string {
  return `/admin/kursy/${id}`;
}

/** Kolumny listy kursów: nazwa pierwsza, stan, dwie liczby do prawej, akcja na końcu. */
export const KOLUMNY_KURSOW: KolumnaRecordList[] = [
  { nazwa: "Kurs", rodzaj: "tekst" },
  { nazwa: "Stan", rodzaj: "stan" },
  { nazwa: "Miejsce w ścieżce", rodzaj: "liczba", klucz: "miejsce" },
  { nazwa: "Lekcje", rodzaj: "liczba", klucz: "lekcje" },
  { nazwa: "Akcja", rodzaj: "akcja" },
];

/** Jednostka liczby lekcji: „lekcja”, „lekcje”, „lekcji” — odmiana ze wspólnego pomocnika. */
export function jednostkaLekcji(liczba: number): string {
  return odmien(liczba, "lekcja", "lekcje", "lekcji");
}

/** Kolumna „Miejsce w ścieżce”: sama liczba (znaczenie niesie nazwa kolumny) albo napis kursu spoza ścieżki. */
export function miejsceWSciezce(pozycja: number | null): KomorkaRecordList {
  return pozycja === null ? { tekst: "poza ścieżką" } : { liczba: pozycja, bezJednostki: true };
}

/** Opis pod nazwą kursu: sam typ (etykieta ze słownika); grupa produktowa jest schowana. */
export function opisKursu(kurs: KursAdministracji): string {
  return COURSE_TYPE_LABELS[kurs.type] ?? kurs.type;
}

/** Wiersze `RecordList`: nazwa z opisem, plakietka publikacji, miejsce w ścieżce, liczba lekcji, akcja „Otwórz” (pełna nazwa z tytułem tylko dla czytnika). */
export function wierszeKursow(kursy: KursAdministracji[]): WierszRecordList[] {
  return kursy.map((kurs) => ({
    id: String(kurs.id),
    tytul: kurs.title,
    podpowiedz: opisKursu(kurs),
    plakietka: kurs.is_published
      ? { wariant: "ok" as const, tekst: "Opublikowany" }
      : { wariant: "neutral" as const, tekst: "Szkic" },
    komorki: {
      miejsce: miejsceWSciezce(kurs.sequence_order),
      lekcje: { liczba: kurs.lessons_count, jednostka: jednostkaLekcji(kurs.lessons_count) },
    },
    akcja: { etykieta: "Otwórz", etykietaDostepna: `Otwórz kurs: ${kurs.title}`, href: adresKursu(kurs.id) },
  }));
}

const ZNAKI_POLSKIE: Record<string, string> = {
  ą: "a",
  ć: "c",
  ę: "e",
  ł: "l",
  ń: "n",
  ó: "o",
  ś: "s",
  ź: "z",
  ż: "z",
};

const NAJWYZEJ_ZNAKOW_IDENTYFIKATORA = 255;

/**
 * Identyfikator kursu z tytułu — wyłącznie małe litery bez znaków diakrytycznych,
 * cyfry i `_`, z `-` zamiast spacji i każdego innego znaku spoza `alpha_dash`
 * zaplecza (`StoreCourseRequest`: `alpha_dash`, do 255 znaków). Sąsiednie
 * separatory zlewają się w jeden, na brzegach ich nie ma.
 */
export function identyfikatorZTytulu(tytul: string): string {
  const bezPolskich = tytul.toLowerCase().replace(/[ąćęłńóśźż]/g, (znak) => ZNAKI_POLSKIE[znak] ?? znak);
  const bezDiakrytykow = bezPolskich.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return bezDiakrytykow
    .replace(/[^a-z0-9_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, NAJWYZEJ_ZNAKOW_IDENTYFIKATORA)
    .replace(/-+$/g, "");
}

/** Pozycja wpisana w formularzu: puste = `null` (poza ścieżką), liczba całkowita = liczba, reszta dosłownie do walidacji serwera. */
export function pozycjaZPola(wpisana: string): number | string | null {
  const tekst = wpisana.trim();
  if (tekst === "") return null;
  return /^\d+$/.test(tekst) ? Number(tekst) : tekst;
}

/** Kursy ze ścieżki (z pozycją) — tylko one biorą udział w zmianie kolejności. */
export function kursyWSciezce(kursy: KursAdministracji[]): KursAdministracji[] {
  return kursy.filter((kurs) => kurs.sequence_order !== null);
}

/** Nowa tablica z elementem `indeks` przesuniętym o `kierunek` (-1 w górę, 1 w dół); poza zakresem — bez zmiany. */
export function przesun<T>(lista: T[], indeks: number, kierunek: -1 | 1): T[] {
  const cel = indeks + kierunek;
  if (indeks < 0 || indeks >= lista.length || cel < 0 || cel >= lista.length) return lista;
  const kopia = [...lista];
  [kopia[indeks], kopia[cel]] = [kopia[cel], kopia[indeks]];
  return kopia;
}

/** Wiersze podglądu wpływu zmiany (kształt `DataTable`): osoba, kurs, status było → będzie. */
export function wierszePodgladu(podglad: ReorderImpactRow[]): WierszDataTable[] {
  return podglad.map((wiersz) => ({
    id: `${wiersz.user_id}-${wiersz.course_id}`,
    wartosci: {
      osoba: `${wiersz.first_name} ${wiersz.last_name}`,
      kurs: wiersz.course_title,
      bylo: COURSE_STATE_LABELS[wiersz.from] ?? wiersz.from,
      bedzie: COURSE_STATE_LABELS[wiersz.to] ?? wiersz.to,
    },
  }));
}

/** 401 albo 403 — rola spoza administracji; wszystko inne to błąd odczytu. */
export function czyBrakUprawnien(blad: unknown): boolean {
  return blad instanceof ApiError && (blad.status === 401 || blad.status === 403);
}

/** Komunikat z koperty błędu serwera; `undefined`, gdy koperty nie ma (np. brak połączenia). */
export function komunikatKoperty(blad: unknown): string | undefined {
  return blad instanceof ApiError && blad.message.trim() !== "" ? blad.message : undefined;
}

export const KOMUNIKAT_SIECI = "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.";
