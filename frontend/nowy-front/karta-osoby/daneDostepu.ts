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
 * tam nie wysyła. Powód zmiany jest polem obowiązkowym formularza, ale trasa
 * dziś go nie przyjmuje ani nie zapisuje, więc nie trafia do ciała żądania.
 */

/** Role dopuszczone przez trasę zmiany daty (`role:project_manager,super_admin` w `h04.php`). */
export const ROLE_ZMIANY_DATY_DOSTEPU: readonly string[] = ["project_manager", "super_admin"];

export function czyMozeZmienicDateDostepu(rola: string | null): boolean {
  return rola !== null && ROLE_ZMIANY_DATY_DOSTEPU.includes(rola);
}

export interface CialoZmianyDaty {
  until: string;
}

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

export const ZDANIE_DATA_NIE_POZNIEJSZA = "Wybierz datę późniejszą niż dzisiejsza.";
export const ZDANIE_DATA_NIEPOPRAWNA = "Podaj poprawną datę.";
export const ZDANIE_BRAK_POWODU = "Wpisz powód zmiany.";
export const PODPOWIEDZ_POWODU = "Pisz rzeczowo, bez informacji o zdrowiu.";
export const PODPOWIEDZ_DATY = "Dostęp do materiałów będzie otwarty do tego dnia.";
export const PODPOWIEDZ_SKROCENIA = "Wybrana data jest wcześniejsza niż obecna — dostęp zostanie skrócony.";

const MS_NA_DOBE = 24 * 60 * 60 * 1000;

/** Dzisiejszy dzień kalendarzowy w Warszawie jako `YYYY-MM-DD`. */
export function dzisiajWWarszawie(teraz: Date): string {
  return new Date(numerDniaKalendarzowego(teraz.getTime()) * MS_NA_DOBE).toISOString().slice(0, 10);
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

/** Kontrola pól przed wysłaniem: data późniejsza niż dziś (w Warszawie) i niepusty powód. */
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
  if (powod.trim() === "") bledy.powod = ZDANIE_BRAK_POWODU;
  if (bledy.data || bledy.powod) return { bledy };
  return { cialo: { until: dzien as string } };
}

/** Czy wybrany dzień jest wcześniejszy niż obecna data końca dostępu (skrócenie dostępu). */
export function czySkraca(obecna: string | null, wybrana: string): boolean {
  const dzien = dataKalendarzowa(wybrana);
  if (obecna === null || dzien === null) return false;
  const obecnaData = new Date(obecna);
  return !Number.isNaN(obecnaData.getTime()) && new Date(`${dzien}T00:00:00Z`) < obecnaData;
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

/** Błąd zapisu → błąd pola daty (422 z `until`) albo jedno zdanie na górze okna. */
export function wynikZBleduZmianyDaty(blad: unknown): WynikBleduZmianyDaty {
  if (blad instanceof ApiError) {
    if (blad.status === 422) {
      const data = blad.errors?.until?.[0];
      if (data) return { rodzaj: "pola", bledy: { data } };
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
