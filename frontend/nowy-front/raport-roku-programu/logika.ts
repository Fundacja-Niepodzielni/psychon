import { ROLE_LABELS } from "@/lib/h18/labels";
import { SCIEZKA_KARTY } from "@/nowy-front/osoby-lista/dane";
import { formatujDate } from "@/nowy-front/wspolne/daty";
import { formatujDziesietny } from "@/nowy-front/wspolne/formatuj-dziesietny";
import { odmien } from "@/nowy-front/wspolne/odmiana";
import type { OsobaZestawienia, RaportRokuProgramu } from "./dane";

/**
 * Czysta logika ekranu „Raport roku programu”: walidacja okresu, zdania
 * o datach, pary nazwa–wartość list liczb i wiersze zestawienia. Liczby
 * pochodzą wyłącznie z odpowiedzi zaplecza; ekran nie liczy ich po swojemu.
 */

export const LICZBA_NA_STRONE = 25;

/** Które liczby zawężają daty, a które są stanem dziś — to samo, co liczy zaplecze (`ReportSummary`). */
export const ZDANIE_O_DATACH =
  "Daty zawężają tylko godziny dyżurów, średnią na wolontariusza i konsultacje, a pozostałe liczby i zestawienie pokazują stan na dziś.";

export const ZDANIE_ZLEGO_OKRESU = "Data końca nie może być wcześniejsza niż data początku.";

export const ZDANIE_GRANTODAWCY = "Grantodawca dostaje tylko liczby, bez nazwisk.";

export const ZDANIE_ZESTAWIENIA = "Do użytku w Fundacji. Nie przekazuj grantodawcy.";

export const ZDANIE_PUSTEGO_ZESTAWIENIA = "W tym roku programu nie ma jeszcze osób, więc zestawienie jest puste.";

export const ZDANIE_BRAKU_ZDARZEN = "W wybranym okresie nie ma zaakceptowanych dyżurów, więc godziny i konsultacje wynoszą zero.";

export const NIE_DOTYCZY = "nie dotyczy";

/** Liczba z rzeczownikiem w poprawnej formie: „1 osoba”, „2 osoby”, „5 osób”. */
export function zLiczba(liczba: number, jeden: string, kilka: string, wiele: string): string {
  return `${liczba} ${odmien(liczba, jeden, kilka, wiele)}`;
}

/** Godziny z API („41.5”) w zapisie ekranu: „41,5 godz.”. */
export function godziny(tekst: string): string {
  return `${formatujDziesietny(tekst)} godz.`;
}

/** Błąd okresu przed wysłaniem albo `null`. Daty `YYYY-MM-DD` porównują się jak napisy. */
export function walidujOkres(od: string, doDnia: string): string | null {
  if (od !== "" && doDnia !== "" && doDnia < od) return ZDANIE_ZLEGO_OKRESU;
  return null;
}

/** Zdanie o zastosowanym okresie, pod przyciskiem „Pokaż raport za ten okres”. */
export function opisOkresu(okres: RaportRokuProgramu["period"]): string {
  const { from, to } = okres;
  if (from && to) return `Liczby za okres od ${formatujDate(from)} do ${formatujDate(to)}.`;
  if (from) return `Liczby za okres od ${formatujDate(from)}.`;
  if (to) return `Liczby za okres do ${formatujDate(to)}.`;
  return "Liczby bez zawężenia dat.";
}

/** Okres zawężony datami, a w nim zero zaakceptowanych godzin i konsultacji. */
export function brakZdarzenWOkresie(raport: RaportRokuProgramu): boolean {
  const zawezony = Boolean(raport.period.from || raport.period.to);
  return zawezony && Number(raport.program.hours_accepted_total) === 0 && raport.program.consultations_total === 0;
}

export interface Para {
  nazwa: string;
  wartosc: string;
}

/** Najważniejsze liczby programu (wolontariusze), w kolejności z ekranu. */
export function liczbyGlowne(raport: RaportRokuProgramu): Para[] {
  const { program } = raport;
  return [
    { nazwa: "W programie (konto aktywne)", wartosc: String(program.active) },
    { nazwa: "Ukończyli program", wartosc: String(program.completed) },
    { nazwa: "Osoby z zaliczonym testem", wartosc: `${program.with_passed_test} z ${program.active}` },
    { nazwa: "Certyfikaty wydane (bez unieważnionych)", wartosc: String(program.certificates_valid) },
    { nazwa: "Godziny dyżurów", wartosc: godziny(program.hours_accepted_total) },
    { nazwa: "Średnio na wolontariusza", wartosc: godziny(program.hours_accepted_average) },
  ];
}

/** Pozostałe liczby: przyjęci, konsultacje i jeden wiersz studentów. */
export function pozostaleLiczby(raport: RaportRokuProgramu): Para[] {
  const { program, students } = raport;
  return [
    { nazwa: "Przyjęci do programu (zgłoszenia przyjęte)", wartosc: String(program.admitted) },
    { nazwa: "Konsultacje na dyżurach", wartosc: String(program.consultations_total) },
    {
      nazwa: "Studenci",
      wartosc: `${zLiczba(students.active, "osoba", "osoby", "osób")} z kontem aktywnym, ukończyli program: ${students.completed}`,
    },
  ];
}

export interface WierszZestawienia {
  id: number;
  nazwa: string;
  rola: string;
  kursy: string;
  staz: string;
  superwizje: string;
  warsztat: string;
  href: string;
}

export function etykietaRoli(rola: string): string {
  return (ROLE_LABELS as Record<string, string>)[rola] ?? rola;
}

/** Wiersz zestawienia: dla studenta staż i superwizje „nie dotyczy”. */
export function wierszZestawienia(osoba: OsobaZestawienia): WierszZestawienia {
  return {
    id: osoba.id,
    nazwa: `${osoba.first_name} ${osoba.last_name}`.trim(),
    rola: etykietaRoli(osoba.role),
    kursy: `${osoba.courses_done} z ${osoba.courses_total}`,
    staz:
      osoba.internship === null
        ? NIE_DOTYCZY
        : `${formatujDziesietny(osoba.internship.done)} z ${godziny(osoba.internship.required)}`,
    superwizje: osoba.supervision === null ? NIE_DOTYCZY : `${osoba.supervision.attended} z ${osoba.supervision.required}`,
    warsztat: osoba.workshop_completed_at === null ? "nie zaliczony" : `zaliczony ${formatujDate(osoba.workshop_completed_at)}`,
    href: `${SCIEZKA_KARTY}/${osoba.id}`,
  };
}

/** Liczba stron zestawienia (co najmniej 1). */
export function liczbaStron(liczbaOsob: number): number {
  return Math.max(1, Math.ceil(liczbaOsob / LICZBA_NA_STRONE));
}

/** Osoby jednej strony zestawienia; strona spoza zakresu jest przycinana. */
export function stronaZestawienia<T>(osoby: T[], strona: number): T[] {
  const ostatnia = liczbaStron(osoby.length);
  const biezaca = Math.min(Math.max(1, strona), ostatnia);
  return osoby.slice((biezaca - 1) * LICZBA_NA_STRONE, biezaca * LICZBA_NA_STRONE);
}

/** Podpis zestawienia: ile osób, z odmianą. */
export function opisZestawienia(liczbaOsob: number): string {
  return `Wolontariusze i studenci roku programu: ${zLiczba(liczbaOsob, "osoba", "osoby", "osób")}.`;
}
