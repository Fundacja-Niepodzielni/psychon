import { api, ApiError } from "@/lib/api/klient";
import { zdanieOdmowyRoli } from "@/design-system/molekuly/EmptyState/EmptyState";
import { formatujDate, numerDniaKalendarzowego } from "../wspolne/daty";

/**
 * Logika danych okna „Zmień datę dostępu” na karcie osoby: kto widzi przycisk,
 * kontrola pól, ciało żądania, mapowanie błędów serwera. Bez Reacta, żeby dało
 * się ją sprawdzić samym testem jednostkowym.
 *
 * Trasa: `POST /admin/users/{id}/extend-access` (`backend/routes/api/h04.php`)
 * — ta sama, której używał osobny ekran przedłużenia. Okno wysyła wyłącznie
 * pole `until` (data kalendarzowa); trasa przyjmuje jeszcze `months`, ale
 * formularz go nie ma. Zdarzenie w dzienniku działań zapisuje serwer — okno nic
 * tam nie wysyła. Powód zmiany jest polem obowiązkowym formularza i trafia
 * do ciała żądania jako `reason` (przycięty z białych znaków), z limitem
 * 1000 znaków jak przy blokadzie konta: serwer odrzuca pusty i dłuższy powód
 * kodem 422 z błędem na `errors.reason`, a okno pokazuje go przy polu powodu.
 */

/** Role dopuszczone przez trasę zmiany daty (`role:project_manager,super_admin` w `h04.php`). */
export const ROLE_ZMIANY_DATY_DOSTEPU: readonly string[] = ["project_manager", "super_admin"];

export function czyMozeZmienicDateDostepu(rola: string | null): boolean {
  return rola !== null && ROLE_ZMIANY_DATY_DOSTEPU.includes(rola);
}

/**
 * Role osób w programie — tylko one mają datę końca dostępu (`AccountManagementGuard::PROGRAM_ROLES`).
 * Konto prowadzącego i konta administracji nie mają terminu; wyłącza się je blokadą.
 */
export const ROLE_Z_TERMINEM_DOSTEPU: readonly string[] = ["volunteer", "student"];

/**
 * Czy karta pokazuje „Zmień datę”: zalogowana osoba ma rolę, którą dopuszcza trasa,
 * osoba z karty jest w programie (ma termin dostępu), a karta nie jest własnym kontem
 * zalogowanej osoby. Gdy nie wiadomo, kto jest zalogowany (`null`), własności nie rozstrzyga front.
 */
export function czyPokazacZmianeDaty(
  rolaZalogowanej: string | null,
  osoba: { id: number; role: string },
  idZalogowanej: number | null,
): boolean {
  return (
    czyMozeZmienicDateDostepu(rolaZalogowanej) &&
    ROLE_Z_TERMINEM_DOSTEPU.includes(osoba.role) &&
    idZalogowanej !== osoba.id
  );
}

/** Kody odmowy 422 zaplecza, których zdanie (komunikat z koperty) okno pokazuje wprost. */
const KODY_ODMOWY_Z_ZDANIEM: readonly string[] = ["cannot_extend_self", "access_date_not_applicable"];

export interface CialoZmianyDaty {
  until: string;
  reason: string;
}

/**
 * Najdalsza data dostępu: dziś (w Warszawie) + 24 miesiące kalendarzowe. Źródłem
 * prawdy jest serwer, który tę granicę sprawdza dla `until`; front tylko ją
 * podpowiada (atrybut `max` pola) i odrzuca wcześniej, bez żądania.
 */
export const MIESIECY_DOSTEPU_MAKS = 24;

/** Najdłuższy powód zmiany daty — ten sam limit co po stronie serwera (znaki po przycięciu). */
export const POWOD_MAKS_ZNAKOW = 1000;

export interface BledyZmianyDaty {
  data?: string;
  powod?: string;
}

/** Osoba po zmianie daty — zasób użytkownika bez pola potwierdzenia aktywacji. */
export interface OsobaPoZmianieDaty {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  roles: string[];
  access_expires_at: string | null;
  program_completed_at: string | null;
}

export const ZDANIE_DATA_NIE_POZNIEJSZA = "Data końca dostępu musi być późniejsza niż dzisiejsza.";
export const ZDANIE_DATA_NIEPOPRAWNA = "Podaj poprawną datę.";
export const ZDANIE_DATA_ZA_DALEKO = `Nowa data dostępu może być najwyżej ${MIESIECY_DOSTEPU_MAKS} miesiące od dziś.`;
export const ZDANIE_BRAK_POWODU = "Wpisz powód zmiany.";
export const ZDANIE_ZA_DLUGI_POWOD = `Powód może mieć najwyżej ${POWOD_MAKS_ZNAKOW} znaków.`;
export const PODPOWIEDZ_POWODU = "Pisz rzeczowo, bez informacji o zdrowiu.";
export const PODPOWIEDZ_DATY = "Dostęp do materiałów będzie otwarty do tego dnia.";
export const PODPOWIEDZ_SKROCENIA = "Wybrana data jest wcześniejsza niż obecna — dostęp zostanie skrócony.";

/**
 * Dzisiejszy dzień kalendarzowy w Warszawie jako `YYYY-MM-DD`: numer dnia ze
 * wspólnego liczenia (`numerDniaKalendarzowego`) przeliczony z powrotem na datę
 * jako przesunięcie od 1 stycznia 1970 r.
 */
export function dzisiajWWarszawie(teraz: Date): string {
  return new Date(Date.UTC(1970, 0, 1 + numerDniaKalendarzowego(teraz.getTime()))).toISOString().slice(0, 10);
}

/**
 * Dziś + 24 miesiące kalendarzowe jako `YYYY-MM-DD`. Dzień miesiąca zostaje ten
 * sam; gdy w miesiącu docelowym go nie ma (29 lutego), wypada ostatni dzień tego
 * miesiąca — nie następny miesiąc.
 */
export function najpozniejszaDataDostepu(dzisiaj: string): string {
  const [rok, miesiac, dzien] = dzisiaj.split("-").map(Number);
  const razem = rok * 12 + (miesiac - 1) + MIESIECY_DOSTEPU_MAKS;
  const rokDocelowy = Math.floor(razem / 12);
  const miesiacDocelowy = razem % 12;
  const ostatniDzien = new Date(Date.UTC(rokDocelowy, miesiacDocelowy + 1, 0)).getUTCDate();
  return new Date(Date.UTC(rokDocelowy, miesiacDocelowy, Math.min(dzien, ostatniDzien))).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD`, który naprawdę istnieje w kalendarzu; inaczej `null`. */
export function dataKalendarzowa(tekst: string): string | null {
  const czyste = tekst.trim();
  const trafienie = /^(\d{4})-(\d{2})-(\d{2})$/.exec(czyste);
  if (!trafienie) return null;
  const [rok, miesiac, dzien] = [Number(trafienie[1]), Number(trafienie[2]), Number(trafienie[3])];
  const data = new Date(Date.UTC(rok, miesiac - 1, dzien));
  const zgodna = data.getUTCFullYear() === rok && data.getUTCMonth() === miesiac - 1 && data.getUTCDate() === dzien;
  return zgodna ? czyste : null;
}

/**
 * Kontrola pól przed wysłaniem: data późniejsza niż dziś (w Warszawie) i powód
 * niepusty po przycięciu, najwyżej 1000 znaków (liczonych jak na serwerze —
 * znak spoza podstawowej płaszczyzny to jeden znak, nie dwa).
 */
export function sprawdzZmianeDaty(
  data: string,
  powod: string,
  dzisiaj: string,
): { cialo: CialoZmianyDaty } | { bledy: BledyZmianyDaty } {
  const bledy: BledyZmianyDaty = {};
  const dzien = dataKalendarzowa(data);
  if (data.trim() === "") bledy.data = ZDANIE_DATA_NIE_POZNIEJSZA;
  else if (dzien === null) bledy.data = ZDANIE_DATA_NIEPOPRAWNA;
  else if (dzien <= dzisiaj) bledy.data = ZDANIE_DATA_NIE_POZNIEJSZA;
  else if (dzien > najpozniejszaDataDostepu(dzisiaj)) bledy.data = ZDANIE_DATA_ZA_DALEKO;
  const powodPrzyciety = powod.trim();
  if (powodPrzyciety === "") bledy.powod = ZDANIE_BRAK_POWODU;
  else if (Array.from(powodPrzyciety).length > POWOD_MAKS_ZNAKOW) bledy.powod = ZDANIE_ZA_DLUGI_POWOD;
  if (bledy.data || bledy.powod) return { bledy };
  return { cialo: { until: dzien as string, reason: powodPrzyciety } };
}

/**
 * Początek dnia kalendarzowego `YYYY-MM-DD` według UTC, w milisekundach od
 * epoki — składany z roku, miesiąca i dnia, bez parsowania napisu. Dla dnia
 * zwróconego przez `dataKalendarzowa` daje dokładnie tę samą wartość co
 * parsowanie daty zapisanej z północą UTC.
 */
export function poczatekDniaUTC(dzien: string): number {
  const [rok, miesiac, dzienMiesiaca] = dzien.split("-").map(Number);
  return Date.UTC(rok, miesiac - 1, dzienMiesiaca);
}

/** Czy wybrany dzień jest wcześniejszy niż obecna data końca dostępu (skrócenie dostępu). */
export function czySkraca(obecna: string | null, wybrana: string): boolean {
  const dzien = dataKalendarzowa(wybrana);
  if (obecna === null || dzien === null) return false;
  const obecnaData = new Date(obecna);
  return !Number.isNaN(obecnaData.getTime()) && poczatekDniaUTC(dzien) < obecnaData.getTime();
}

/** Obecna data końca dostępu słowami („1 lutego 2027”), a jej brak — zdaniem. */
export function opisObecnejDaty(obecna: string | null): string {
  return obecna === null ? "brak ustawionej daty" : formatujDate(obecna);
}

/** Zdanie do stałego obszaru ogłoszeń po zapisie — słowo neutralne: „zmieniona”. */
export function zdanieOZmianieDaty(nowa: string | null): string {
  return nowa === null ? "Data dostępu zmieniona." : `Data dostępu zmieniona na ${formatujDate(nowa)}.`;
}

export function zmienDateDostepu(idOsoby: number, cialo: CialoZmianyDaty): Promise<OsobaPoZmianieDaty> {
  return api<OsobaPoZmianieDaty>(`/admin/users/${idOsoby}/extend-access`, { method: "POST", body: cialo });
}

export type WynikBleduZmianyDaty =
  | { rodzaj: "pola"; bledy: BledyZmianyDaty }
  | { rodzaj: "ogolny"; tresc: string };

/** Błąd zapisu → błędy pól (422 z `until` i/lub `reason`, zdanie z serwera) albo jedno zdanie na górze okna. */
export function wynikZBleduZmianyDaty(blad: unknown): WynikBleduZmianyDaty {
  if (blad instanceof ApiError) {
    if (blad.status === 422) {
      const bledy: BledyZmianyDaty = {};
      const data = blad.errors?.until?.[0];
      const powod = blad.errors?.reason?.[0];
      if (data) bledy.data = data;
      if (powod) bledy.powod = powod;
      if (data || powod) return { rodzaj: "pola", bledy };
      if (KODY_ODMOWY_Z_ZDANIEM.includes(blad.code) && blad.message.trim() !== "") return { rodzaj: "ogolny", tresc: blad.message };
      return { rodzaj: "ogolny", tresc: "Popraw datę i spróbuj ponownie. Data dostępu nie została zmieniona." };
    }
    if (blad.status === 401 || blad.status === 403) {
      return { rodzaj: "ogolny", tresc: zdanieOdmowyRoli("administracji") };
    }
    if (blad.status === 404) {
      return { rodzaj: "ogolny", tresc: "Nie znaleziono osoby. Data dostępu nie została zmieniona." };
    }
  }
  return {
    rodzaj: "ogolny",
    tresc: "Nie udało się zmienić daty dostępu. Data nie została zmieniona — spróbuj ponownie.",
  };
}
