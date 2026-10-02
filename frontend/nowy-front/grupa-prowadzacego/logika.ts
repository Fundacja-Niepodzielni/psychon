/**
 * Teksty i reguły ekranu „Moja grupa” — czysta logika bez Reacta, żeby każde zdanie dało się
 * zmierzyć testem jednostkowym. Słowa o postępie są te same co na pulpicie prowadzącego:
 * „Kursy: 2 z 5 · staż: 12,5 godz. · superwizje: 1”.
 */
import { ApiError } from "@/lib/api/klient";
import { formatujDateICzas } from "../wspolne/daty";
import { formatujDziesietny } from "../wspolne/formatuj-dziesietny";
import { odmien } from "../wspolne/odmiana";
import type { WierszBezAkcjiRecordList, KolumnaRecordList } from "@/design-system/organizmy/RecordList/RecordList";
import type { Attendance, FormularzSprawy, FormularzTerminu, GroupMember, InstructorSlot, OsobaRzetelnosci } from "./dane";
import { DOMYSLNY_TERMIN } from "./dane";

export const ADRES_PULPITU_PROWADZACEGO = "/prowadzacy";

export function pelneImie(osoba: { first_name: string; last_name: string }): string {
  return `${osoba.first_name} ${osoba.last_name}`;
}

/* -------------------------------------------------------------------- */
/* Osoby grupy                                                           */
/* -------------------------------------------------------------------- */

/** „5 osób w grupie” — odmiana według liczby. */
export function zdanieOLiczbieOsob(liczba: number): string {
  return `${liczba} ${odmien(liczba, "osoba", "osoby", "osób")} w grupie`;
}

/** „Znaleziono 2 z 5 osób.” — dla filtru po nazwisku; „osób” po „z N” zawsze w dopełniaczu. */
export function zdanieOWynikachFiltru(znaleziono: number, razem: number): string {
  return `Znaleziono ${znaleziono} z ${razem} ${odmien(razem, "osoby", "osób", "osób")}.`;
}

/** Filtr po imieniu i nazwisku: wielkość liter i polskie znaki bez znaczenia dla wielkości, kolejność słów dowolna. */
export function filtrujOsoby(osoby: GroupMember[], fraza: string): GroupMember[] {
  const slowa = fraza.trim().toLocaleLowerCase("pl").split(/\s+/).filter(Boolean);
  if (slowa.length === 0) return osoby;
  return osoby.filter((osoba) => {
    const pelne = pelneImie(osoba).toLocaleLowerCase("pl");
    return slowa.every((slowo) => pelne.includes(slowo));
  });
}

export const KOLUMNY_OSOB: KolumnaRecordList[] = [
  { nazwa: "Osoba", rodzaj: "tekst" },
  { nazwa: "Kursy", rodzaj: "tekst", klucz: "kursy" },
  { nazwa: "Staż", rodzaj: "tekst", klucz: "staz" },
  { nazwa: "Superwizje", rodzaj: "liczba", klucz: "superwizje" },
  { nazwa: "Warsztat", rodzaj: "stan" },
];

/** Wiersze postępu: imię i nazwisko oraz cztery liczby postępu — nic więcej o osobie. */
export function wierszeOsob(osoby: GroupMember[]): WierszBezAkcjiRecordList[] {
  return osoby.map((osoba) => ({
    id: `osoba-${osoba.id}`,
    tytul: pelneImie(osoba),
    tytulPogrubiony: true,
    plakietka: osoba.progress.workshop_done
      ? { wariant: "ok", tekst: "Ukończony" }
      : { wariant: "neutral", tekst: "Nieukończony" },
    komorki: {
      kursy: { tekst: `${osoba.progress.courses_done} z ${osoba.progress.courses_total}` },
      staz: { tekst: `${formatujDziesietny(osoba.progress.hours_accepted)} godz.` },
      superwizje: { liczba: osoba.progress.supervision_present, bezJednostki: true },
    },
  }));
}

/* -------------------------------------------------------------------- */
/* Rzetelność nauki                                                      */
/* -------------------------------------------------------------------- */

export function wierszeRzetelnosci(osoby: OsobaRzetelnosci[]): WierszBezAkcjiRecordList[] {
  return osoby.map((osoba) => ({
    id: `rzetelnosc-${osoba.id}`,
    tytul: pelneImie(osoba),
    tytulPogrubiony: true,
    podpowiedz: osoba.reliability_percent === null ? undefined : `Wynik: ${formatujDziesietny(osoba.reliability_percent)}%`,
    plakietka:
      osoba.reliability_percent === null
        ? { wariant: "neutral", tekst: "Brak danych" }
        : osoba.below_threshold
          ? { wariant: "warn", tekst: "Poniżej progu" }
          : { wariant: "ok", tekst: "W normie" },
  }));
}

/* -------------------------------------------------------------------- */
/* Terminy i obecności                                                   */
/* -------------------------------------------------------------------- */

export const ETYKIETY_OBECNOSCI: Record<Attendance, string> = {
  present: "Obecność",
  absent: "Nieobecność",
};

/** „Oznaczono: obecność.” / „Obecność jeszcze nieoznaczona.” — pod imieniem i nazwiskiem osoby zapisanej na termin. */
export function zdanieOObecnosci(wartosc: Attendance | null): string {
  return wartosc === null ? "Obecność jeszcze nieoznaczona." : `Oznaczono: ${ETYKIETY_OBECNOSCI[wartosc].toLowerCase()}.`;
}

export function tytulTerminu(termin: InstructorSlot): string {
  return formatujDateICzas(termin.starts_at);
}

/** „Zajęte miejsca: 2 z 3 · 90 min · sala 4” — miejsce tylko, gdy je podano. */
export function opisTerminu(termin: InstructorSlot): string {
  const czesci = [`Zajęte miejsca: ${termin.active_signups_count} z ${termin.seats_limit}`, `${termin.duration_minutes} min`];
  if (termin.location_or_link) czesci.push(termin.location_or_link);
  return czesci.join(" · ");
}

export function zdanieOWolnychMiejscach(wolne: number): string {
  return `${wolne} ${odmien(wolne, "wolne miejsce", "wolne miejsca", "wolnych miejsc")}`;
}

/** Terminy rosnąco po początku; remis zachowuje kolejność z serwera. */
export function posortujTerminy(terminy: InstructorSlot[]): InstructorSlot[] {
  return terminy
    .map((termin, indeks) => ({ termin, indeks }))
    .sort((a, b) => a.termin.starts_at.localeCompare(b.termin.starts_at) || a.indeks - b.indeks)
    .map(({ termin }) => termin);
}

/** Obecność osoby: wartość wybrana teraz, a gdy jej nie ma — zapisana na serwerze. */
export function obecnoscOsoby(
  termin: InstructorSlot,
  idOsoby: number,
  wybrane: Record<number, Record<number, Attendance>>,
): Attendance | null {
  return wybrane[termin.id]?.[idOsoby] ?? termin.signups.find((zapis) => zapis.user.id === idOsoby)?.attendance ?? null;
}

/** Ciało `PATCH …/attendance`: tylko osoby z wartością, identyfikator osoby jako klucz tekstowy. */
export function wartosciObecnosci(
  termin: InstructorSlot,
  wybrane: Record<number, Record<number, Attendance>>,
): Record<string, Attendance> {
  const wynik: Record<string, Attendance> = {};
  for (const zapis of termin.signups) {
    const wartosc = obecnoscOsoby(termin, zapis.user.id, wybrane);
    if (wartosc) wynik[String(zapis.user.id)] = wartosc;
  }
  return wynik;
}

/* -------------------------------------------------------------------- */
/* Formularze                                                            */
/* -------------------------------------------------------------------- */

export function terminZmieniony(formularz: FormularzTerminu): boolean {
  return (
    formularz.start !== DOMYSLNY_TERMIN.start ||
    formularz.czas !== DOMYSLNY_TERMIN.czas ||
    formularz.miejsca !== DOMYSLNY_TERMIN.miejsca ||
    formularz.miejsce !== DOMYSLNY_TERMIN.miejsce
  );
}

/** Powód, dla którego „Utwórz termin” jest niedostępny, albo `null`, gdy można go wysłać. */
export function powodBrakuTerminu(formularz: FormularzTerminu): string | null {
  if (formularz.start.trim() === "") return "Podaj datę i godzinę spotkania.";
  if (Number.isNaN(new Date(formularz.start).getTime())) return "Podaj prawidłową datę i godzinę spotkania.";
  return null;
}

/** Powód, dla którego „Zgłoś sprawę” jest niedostępny, albo `null`. */
export function powodBrakuSprawy(formularz: FormularzSprawy): string | null {
  const brakuje = [formularz.temat.trim() === "" ? "temat" : null, formularz.opis.trim() === "" ? "opis sprawy" : null].filter(Boolean);
  return brakuje.length === 0 ? null : `Wpisz ${brakuje.join(" i ")}.`;
}

export function sprawaZmieniona(formularz: FormularzSprawy): boolean {
  return formularz.osoba !== "" || formularz.temat !== "" || formularz.opis !== "";
}

export function licznikZnakow(tekst: string, limit: number): string {
  return `${tekst.length}/${limit} ${odmien(limit, "znak", "znaki", "znaków")}`;
}


/* -------------------------------------------------------------------- */
/* Błędy serwera                                                         */
/* -------------------------------------------------------------------- */

export function bladPola(bledy: Record<string, string[]> | undefined, klucz: string): string | undefined {
  return bledy?.[klucz]?.[0];
}

export function komunikatBledu(blad: unknown, zastepczy: string): string {
  return blad instanceof ApiError ? blad.message : zastepczy;
}

/** Odpowiedź 422 z polami: zwraca błędy pól, inaczej `undefined`. */
export function bledyPolZOdpowiedzi(blad: unknown): Record<string, string[]> | undefined {
  return blad instanceof ApiError && blad.status === 422 ? (blad.errors ?? {}) : undefined;
}
