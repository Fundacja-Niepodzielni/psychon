import { api, ApiError } from "@/lib/api/klient";
import {
  pobierzPlikDziennika,
  pobierzWpisyDziennika,
  type FiltrDziennikaApi,
  type GrupaZdarzen,
  type WpisDziennika,
} from "@/lib/api/h20-dziennik";
import { SCIEZKA_KARTY } from "../osoby-lista/dane";
import { formatujDateICzas, numerDniaKalendarzowego } from "../wspolne/daty";
import { odmien } from "../wspolne/odmiana";
import { nazwaGrupy, zdanie } from "./slownik";

/**
 * Dane ekranu „Dziennik działań” — `GET /admin/audit` i
 * `GET /admin/audit/export.csv` przez `lib/api/h20-dziennik.ts`, oraz
 * `GET /admin/edition` (daty edycji) dla gotowego zakresu „Cały rok programu”.
 * Pomiar stanu sprzed zmiany: `./POMIAR.md`.
 *
 * Daty filtrów to dni kalendarzowe w Polsce (`RRRR-MM-DD`). Do zaplecza idą
 * jako chwile UTC: początek pierwszego dnia i ostatnia milisekunda ostatniego
 * — liczone z `numerDniaKalendarzowego` (wspólny moduł dat), więc zmiana czasu
 * letniego na zimowy nie przesuwa granic o godzinę.
 */

export const LICZBA_NA_STRONE = 25;
export const LIMIT_SZUKANEJ_FRAZY = 255;

const MS_NA_GODZINE = 60 * 60 * 1000;
const DATA_KALENDARZOWA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Filtr ekranu tak, jak stoi w polach. */
export interface FiltrDziennika {
  od: string;
  do: string;
  grupa: GrupaZdarzen | "";
  /** Kogo dotyczy — imię i nazwisko. */
  dotyczy: string;
  /** Kto wykonał czynność — imię i nazwisko. */
  kto: string;
}

export const PUSTY_FILTR: FiltrDziennika = { od: "", do: "", grupa: "", dotyczy: "", kto: "" };

export function filtrAktywny(filtr: FiltrDziennika): boolean {
  return filtr.od !== "" || filtr.do !== "" || filtr.grupa !== "" || filtr.dotyczy.trim() !== "" || filtr.kto.trim() !== "";
}

/** Dzień kalendarzowy w Polsce (`RRRR-MM-DD`) dla chwili `ms`. */
export function dzienWPolsce(ms: number): string {
  // Numer dnia liczy wspólny moduł dat; `Date.UTC` zamienia go z powrotem na datę.
  return new Date(Date.UTC(1970, 0, 1 + numerDniaKalendarzowego(ms))).toISOString().slice(0, 10);
}

/** Dzień przesunięty o `dni` (dzień kalendarzowy, bez godzin). */
export function przesunDzien(dzien: string, dni: number): string {
  const [, rok, miesiac, d] = DATA_KALENDARZOWA.exec(dzien) ?? [];
  return new Date(Date.UTC(Number(rok), Number(miesiac) - 1, Number(d) + dni)).toISOString().slice(0, 10);
}

/**
 * Chwila (ms) północy dnia `dzien` w Polsce. Północ w Polsce to 22:00 albo
 * 23:00 UTC dnia poprzedniego (czas letni albo zimowy); zmiana czasu
 * przypada o 2:00–3:00, więc północ zawsze ma jedno z tych dwóch przesunięć.
 */
export function polnocWPolsce(dzien: string): number | null {
  const dopasowanie = DATA_KALENDARZOWA.exec(dzien);
  if (dopasowanie === null) return null;
  const utc = Date.UTC(Number(dopasowanie[1]), Number(dopasowanie[2]) - 1, Number(dopasowanie[3]));
  if (Number.isNaN(utc)) return null;
  // Południe UTC tego dnia wypada w Polsce tego samego dnia — to numer dnia docelowego.
  const docelowy = numerDniaKalendarzowego(utc + 12 * MS_NA_GODZINE);
  const latem = utc - 2 * MS_NA_GODZINE;
  return numerDniaKalendarzowego(latem) === docelowy ? latem : utc - MS_NA_GODZINE;
}

/** Gotowe zakresy dat — „Cały rok programu” bierze daty edycji, więc nie stoi tutaj. */
export type GotowyZakres = "dzis" | "tydzien" | "miesiac";

export const NAZWY_ZAKRESOW: Record<GotowyZakres | "rok", string> = {
  dzis: "Dziś",
  tydzien: "Ostatnie 7 dni",
  miesiac: "Ten miesiąc",
  rok: "Cały rok programu",
};

export function zakres(rodzaj: GotowyZakres, teraz: number): { od: string; do: string } {
  const dzis = dzienWPolsce(teraz);
  if (rodzaj === "dzis") return { od: dzis, do: dzis };
  if (rodzaj === "tydzien") return { od: przesunDzien(dzis, -6), do: dzis };
  return { od: `${dzis.slice(0, 7)}-01`, do: dzis };
}

/** Gotowy zakres liczony od chwili kliknięcia (zegar czytany tu, nie w renderze ekranu). */
export function zakresOdDzis(rodzaj: GotowyZakres): { od: string; do: string } {
  return zakres(rodzaj, Date.now());
}

/** Daty edycji — `GET /admin/edition`, pola `starts_at` i `ends_at` (dni kalendarzowe). */
export async function pobierzRokProgramu(): Promise<{ od: string; do: string }> {
  const edycja = await api<{ starts_at: string | null; ends_at: string | null }>("/admin/edition");
  if (!edycja.starts_at || !edycja.ends_at) throw new Error("Edycja nie ma dat początku i końca.");
  return { od: edycja.starts_at, do: edycja.ends_at };
}

/** Zdanie o błędnym zakresie albo `null`, gdy zakres jest poprawny. */
export function bladZakresu(filtr: FiltrDziennika): string | null {
  if (filtr.od !== "" && filtr.do !== "" && filtr.od > filtr.do) {
    return "Data „Od” jest późniejsza niż data „Do”. Zmień jedną z nich.";
  }
  return null;
}

/** Parametry zapytania z filtra ekranu, osoby ze znacznika „Dotyczy” i strony. */
export function filtrZapytania(filtr: FiltrDziennika, dotyczyId: number | null, strona?: number): FiltrDziennikaApi {
  const fraza = (tekst: string) => {
    const przyciete = tekst.trim().slice(0, LIMIT_SZUKANEJ_FRAZY);
    return przyciete === "" ? undefined : przyciete;
  };
  const od = polnocWPolsce(filtr.od);
  const poDo = polnocWPolsce(dzienPoDniuDo(filtr.do));
  return {
    group: filtr.grupa === "" ? undefined : filtr.grupa,
    subject_user_id: dotyczyId ?? undefined,
    subject_search: fraza(filtr.dotyczy),
    actor_search: fraza(filtr.kto),
    from: od === null ? undefined : new Date(od).toISOString(),
    to: poDo === null ? undefined : new Date(poDo - 1).toISOString(),
    page: strona,
    per_page: strona === undefined ? undefined : LICZBA_NA_STRONE,
  };
}

/** Dzień po dniu „Do” (do wyliczenia jego ostatniej milisekundy); pusty dla pustego „Do”. */
function dzienPoDniuDo(dzien: string): string {
  return DATA_KALENDARZOWA.test(dzien) ? przesunDzien(dzien, 1) : "";
}

export function pobierzStrone(filtr: FiltrDziennika, dotyczyId: number | null, strona: number) {
  return pobierzWpisyDziennika(filtrZapytania(filtr, dotyczyId, strona));
}

/** Pobranie pliku z bieżącymi filtrami — wszystkie strony, kolumny ekranu. */
export function pobierzPlik(filtr: FiltrDziennika, dotyczyId: number | null): Promise<void> {
  return pobierzPlikDziennika(filtrZapytania(filtr, dotyczyId));
}

/** Wykonawca bez konta — zdarzenie zapisane przez system (to samo słowo co w eksporcie). */
export const BEZ_WYKONAWCY = "System";

/** „Kogo dotyczy” wpisu bez osoby i bez nazwanej rzeczy (to samo co w eksporcie). */
export const NIKT = "—";

/** Wiersz ekranu — te same reguły co wiersz eksportu (`AuditLogEntryResource::toCsvRow`). */
export interface OpisWpisu {
  id: number;
  kiedy: string;
  grupa: string;
  zdanie: string;
  /** Nazwa rzeczy w kolumnie „Co” — tylko gdy „Kogo dotyczy” to osoba. */
  rzecz: string | null;
  kogo: { tekst: string; href: string | null };
  kto: string;
}

export function opiszWpis(wpis: WpisDziennika): OpisWpisu {
  const osoba = wpis.subject.person;
  const nazwaOsoby = osoba === null ? null : `${osoba.first_name} ${osoba.last_name}`.trim();
  return {
    id: wpis.id,
    kiedy: formatujDateICzas(wpis.created_at),
    grupa: nazwaGrupy(wpis.group.key),
    zdanie: zdanie(wpis.action),
    rzecz: osoba !== null ? wpis.subject.label : null,
    kogo:
      osoba !== null && nazwaOsoby !== null
        ? { tekst: nazwaOsoby, href: osoba.id === null ? null : `${SCIEZKA_KARTY}/${osoba.id}` }
        : { tekst: wpis.subject.label ?? NIKT, href: null },
    kto: wpis.actor === null ? BEZ_WYKONAWCY : `${wpis.actor.first_name} ${wpis.actor.last_name}`.trim(),
  };
}

/** Licznik nad listą: „25 z 482”. */
export function licznik(naStronie: number, razem: number): string {
  return `${naStronie} z ${razem}`;
}

/** Komunikat dla czytnika po zmianie filtra albo strony: „Pokazano 25 z 482 wpisów”. */
export function komunikatWyniku(naStronie: number, razem: number): string {
  return `Pokazano ${naStronie} z ${razem} ${odmien(razem, "wpisu", "wpisów", "wpisów")}`;
}

/** Imię i nazwisko osoby ze znacznika „Dotyczy” — z wczytanych wpisów, bez dodatkowego odczytu. */
export function nazwaOsobyZWpisow(wpisy: WpisDziennika[], id: number): string | null {
  const osoba = wpisy.find((wpis) => wpis.subject.person?.id === id)?.subject.person;
  return osoba ? `${osoba.first_name} ${osoba.last_name}`.trim() : null;
}

export type BladOdczytu = "zakazane" | "nie-znaleziono" | "siec" | "blad";

/** 401/403 — brak dostępu; 404 — nie znaleziono; inna odpowiedź — błąd; brak odpowiedzi — sieć. */
export function rodzajBledu(wyjatek: unknown): BladOdczytu {
  if (!(wyjatek instanceof ApiError)) return "siec";
  if (wyjatek.status === 401 || wyjatek.status === 403) return "zakazane";
  if (wyjatek.status === 404) return "nie-znaleziono";
  return "blad";
}

/** Identyfikator osoby z parametru adresu `?dotyczy=` albo `null`, gdy to nie jest dodatnia liczba całkowita. */
export function idZAdresu(wartosc: string | null | undefined): number | null {
  if (wartosc === null || wartosc === undefined || !/^\d{1,10}$/.test(wartosc)) return null;
  const id = Number(wartosc);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
