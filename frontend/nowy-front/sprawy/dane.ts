import { apiPaged, ApiError } from "@/lib/api/klient";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import { formatujDate } from "../wspolne/daty";

/**
 * Ekran A-02 „Sprawy" — jedna kolejka decyzji administracji, złożona z trzech
 * źródeł:
 * - `GET /admin/applications?status=new` (H03, kolejka zgłoszeń rekrutacji —
 *   `backend/app/Http/Controllers/Api/V1/Admin/ApplicationController.php:26`,
 *   kształt wiersza `backend/app/Http/Resources/H03/ApplicationResource.php`);
 * - `GET /admin/internship/pending` (H11, dyżury `submitted` —
 *   `backend/app/Http/Controllers/Api/V1/H11/AdminInternshipController.php:20`,
 *   kształt wiersza `backend/app/Http/Resources/H11/AdminInternshipEntryResource.php`);
 * - `GET /admin/profiles` (H15, profile psychologów `submitted` domyślnie —
 *   `backend/app/Http/Controllers/Api/V1/H15/AdminProfileController.php:26-29`,
 *   kształt wiersza `backend/app/Http/Resources/H15/AdminPsychologistProfileResource.php`).
 *
 * Czwarte źródło liczników pulpitu (H19, `GET /admin/dashboard`,
 * `backend/app/Services/H19/DashboardSummary.php:54-61`) niesie klucz
 * `questions` wskazujący `GET /instructor/questions` — trasa jest w grupie
 * `role:instructor` (`backend/routes/api/h17.php:36-37`) i administracja
 * dostaje na niej `403`. Ten ekran jej świadomie nie woła — poza zakresem
 * tej kolejki, administracja nie ma dostępu do tej trasy.
 *
 * Kształty odpowiedzi `openapi.json` mają dla tych trzech tras puste
 * schematy elementu listy (`"items": {}`, generator nie wyprowadza typu z
 * `JsonResource::collect`/`map`). Typy niżej są więc odczytane wprost z klas
 * zasobów wymienionych wyżej, nie z `openapi.json`.
 */

export type RodzajSprawy = "applications" | "internship_entries" | "profiles";

/** Stała kolejność rodzajów — rozstrzyga remis w `porownajSprawy`
 * i kolejność sekcji błędów źródeł. Ta sama kolejność co klucze
 * `queues` w `DashboardSummary::build()` (bez `questions`, patrz wyżej). */
export const KOLEJNOSC_RODZAJOW: RodzajSprawy[] = ["applications", "internship_entries", "profiles"];

/**
 * Jedyny słownik nazw rodzajów spraw (makieta A-02): `wiersz` — nazwa w
 * wierszu listy, w nazwie akcji dla czytnika i w komunikatach źródeł;
 * `filtr` — ta sama nazwa w liczbie mnogiej, w filtrze i w opisie ekranu.
 * Pozostałe stałe niżej są z niego wyprowadzone, nie osobnymi listami.
 */
export const NAZWY_RODZAJOW: Record<RodzajSprawy, { wiersz: string; filtr: string }> = {
  applications: { wiersz: "Zgłoszenie rekrutacyjne", filtr: "Zgłoszenia rekrutacyjne" },
  internship_entries: { wiersz: "Dyżur", filtr: "Dyżury" },
  profiles: { wiersz: "Wniosek o profil psychologa", filtr: "Wnioski o profil psychologa" },
};

export const ETYKIETA_RODZAJU: Record<RodzajSprawy, string> = {
  applications: NAZWY_RODZAJOW.applications.wiersz,
  internship_entries: NAZWY_RODZAJOW.internship_entries.wiersz,
  profiles: NAZWY_RODZAJOW.profiles.wiersz,
};

export const ETYKIETA_FILTRA: Record<RodzajSprawy, string> = {
  applications: NAZWY_RODZAJOW.applications.filtr,
  internship_entries: NAZWY_RODZAJOW.internship_entries.filtr,
  profiles: NAZWY_RODZAJOW.profiles.filtr,
};

/** Jeden element jednolitej kolejki, niezależnie od źródła. */
export interface PozycjaKolejki {
  id: string;
  /** Numeryczny identyfikator ŹRÓDŁOWEGO rekordu (bez przedrostka rodzaju) —
   * ostatnie pole rozstrzygające remis w `porownajSprawy`.
   * `id` (string) NIE nadaje się do tego porównania: porównanie leksykalne
   * `"applications-20" < "applications-5"` jest prawdziwe (znak '2' < '5'),
   * mimo że 20 > 5 — zmierzone przez test tabelaryczny
   * `__tests__/najstarsza-sprawa.test.ts`, nie założone. */
  idLiczbowe: number;
  rodzaj: RodzajSprawy;
  /** „Rodzaj — Imię Nazwisko”: pełna nazwa sprawy (nazwa akcji dla czytnika). */
  tytul: string;
  /** Imię i nazwisko osoby sprawy — druga część wiersza po rodzaju. */
  osoba: string;
  /** Samo nazwisko osoby (`last_name` źródła) — trzecie pole porządku w
   * `porownajSprawy`, porównywane po polsku. */
  nazwisko: string;
  podpowiedz: string;
  /** ISO 8601 albo pusty string (brak daty źródłowej — trafia na koniec
   * porządku w `znajdzNajstarszaSprawe`, nigdy nie wygrywa remisu). */
  czekaOd: string;
  href: string;
}

export interface WynikZrodla {
  rodzaj: RodzajSprawy;
  pozycje: PozycjaKolejki[];
  /** Komunikat do `Notice`, gdy TO źródło zawiodło niezależnie od innych. */
  blad: string | null;
  /** Kod błędu API (`ApiError.code`), do rozpoznania "wszystkie źródła
   * zakazane" (403 `forbidden` na każdym) — pełny ekran `brak-uprawnien`
   * zamiast trzech osobnych `Notice`. */
  kodBledu: string | null;
  /** `meta.total` pierwszej strony — do adnotacji „ponad 100 pozycji"
   * (patrz `MA_NIEPEWNA_KOLEJNOSC` w `Sprawy.tsx`). */
  liczbaCalkowita: number;
}

interface OsobaSkrot {
  id: number;
  first_name: string;
  last_name: string;
}

/** `ApplicationResource::toArray` — pola użyte tutaj. */
interface WierszZgloszenia {
  id: number;
  first_name: string;
  last_name: string;
  created_at: string | null;
}

/** `AdminInternshipEntryResource::toArray` — pola użyte tutaj. */
interface WierszDyzuru {
  id: number;
  created_at: string | null;
  user: OsobaSkrot;
}

/** `AdminPsychologistProfileResource::toArray` — pola użyte tutaj. */
interface WierszProfilu {
  id: number;
  created_at: string | null;
  user: OsobaSkrot;
}

/**
 * Ekran jednego zgłoszenia rekrutacyjnego (`/admin/nabor/{id}`, grupa
 * przełączenia `nabor`). Przy grupie wyłączonej ten adres odpowiada 404, więc
 * „Otwórz” prowadzi wtedy jak dotąd na listę zgłoszeń starej strony osób.
 */
function adresZgloszenia(id: number): string {
  return GRUPY.nabor.wlaczona ? `/admin/nabor/${id}` : "/admin/uczestniczki?zakladka=zgloszenia";
}

export function mapujZgloszenie(wiersz: WierszZgloszenia): PozycjaKolejki {
  return {
    id: `applications-${wiersz.id}`,
    idLiczbowe: wiersz.id,
    rodzaj: "applications",
    tytul: `${ETYKIETA_RODZAJU.applications} — ${wiersz.first_name} ${wiersz.last_name}`,
    osoba: `${wiersz.first_name} ${wiersz.last_name}`,
    nazwisko: wiersz.last_name,
    podpowiedz: `Czeka od ${formatujDate(wiersz.created_at)}`,
    czekaOd: wiersz.created_at ?? "",
    href: adresZgloszenia(wiersz.id),
  };
}

export function mapujDyzur(wiersz: WierszDyzuru): PozycjaKolejki {
  return {
    id: `internship_entries-${wiersz.id}`,
    idLiczbowe: wiersz.id,
    rodzaj: "internship_entries",
    tytul: `${ETYKIETA_RODZAJU.internship_entries} — ${wiersz.user.first_name} ${wiersz.user.last_name}`,
    osoba: `${wiersz.user.first_name} ${wiersz.user.last_name}`,
    nazwisko: wiersz.user.last_name,
    podpowiedz: `Czeka od ${formatujDate(wiersz.created_at)}`,
    czekaOd: wiersz.created_at ?? "",
    // Pojedynczy dyżur nie ma własnego ekranu: „Otwórz” prowadzi do kolejki
    // dyżurów z parametrem `dyzur`, a kolejka otwiera panel tego dyżuru
    // (`app/(administracja)/admin/staz/page.tsx`, `StazKolejka`).
    href: `/admin/staz?dyzur=${wiersz.id}`,
  };
}

export function mapujProfil(wiersz: WierszProfilu): PozycjaKolejki {
  return {
    id: `profiles-${wiersz.id}`,
    idLiczbowe: wiersz.id,
    rodzaj: "profiles",
    tytul: `${ETYKIETA_RODZAJU.profiles} — ${wiersz.user.first_name} ${wiersz.user.last_name}`,
    osoba: `${wiersz.user.first_name} ${wiersz.user.last_name}`,
    nazwisko: wiersz.user.last_name,
    podpowiedz: `Czeka od ${formatujDate(wiersz.created_at)}`,
    czekaOd: wiersz.created_at ?? "",
    href: `/admin/profile/${wiersz.id}`,
  };
}

/**
 * Porządek kolejki — JEDNA funkcja porównania dla listy ekranu i dla akcji
 * „Otwórz najstarszą sprawę”: od najstarszej `czekaOd`; pozycja bez daty
 * (`czekaOd` pusty albo nieczytelny) stoi za wszystkimi z datą. Remis (ta
 * sama chwila albo obie bez daty) rozstrzyga kolejno: rodzaj (stała kolejność
 * `KOLEJNOSC_RODZAJOW`), nazwisko (porównanie po polsku — „Lis” < „Łukasik” <
 * „Żak”), na końcu `idLiczbowe` rosnąco. Porównanie `idLiczbowe` jest
 * liczbowe, nie leksykalne na `id` (string) — patrz komentarz przy polu.
 * Czysta funkcja, testowana tabelarycznie w `__tests__/kolejnosc-spraw.test.ts`.
 */
export function porownajSprawy(a: PozycjaKolejki, b: PozycjaKolejki): number {
  const czasA = Date.parse(a.czekaOd);
  const czasB = Date.parse(b.czekaOd);
  const aMaDate = !Number.isNaN(czasA);
  const bMaDate = !Number.isNaN(czasB);
  if (aMaDate !== bMaDate) return aMaDate ? -1 : 1;
  if (aMaDate && bMaDate && czasA !== czasB) return czasA < czasB ? -1 : 1;
  const roznicaRodzaju = KOLEJNOSC_RODZAJOW.indexOf(a.rodzaj) - KOLEJNOSC_RODZAJOW.indexOf(b.rodzaj);
  if (roznicaRodzaju !== 0) return roznicaRodzaju;
  const roznicaNazwiska = a.nazwisko.localeCompare(b.nazwisko, "pl");
  if (roznicaNazwiska !== 0) return roznicaNazwiska;
  return a.idLiczbowe - b.idLiczbowe;
}

/** Kolejka od najstarszej sprawy wg `porownajSprawy` (nowa tablica, wejście bez zmian). */
export function sortujSprawy(pozycje: PozycjaKolejki[]): PozycjaKolejki[] {
  return [...pozycje].sort(porownajSprawy);
}

/**
 * Najstarsza sprawa: pierwsza w porządku `porownajSprawy` (cel akcji „Otwórz
 * najstarszą sprawę”), `null` dla pustej kolejki. Pierwszy wiersz pełnej
 * listy jest zawsze tą pozycją.
 */
export function znajdzNajstarszaSprawe(pozycje: PozycjaKolejki[]): PozycjaKolejki | null {
  if (pozycje.length === 0) return null;
  return pozycje.reduce((najstarsza, kandydat) => (porownajSprawy(kandydat, najstarsza) < 0 ? kandydat : najstarsza));
}

const PER_PAGE_MAX = 100;

async function pobierzZgloszenia(): Promise<{ pozycje: PozycjaKolejki[]; total: number }> {
  const { data, meta } = await apiPaged<WierszZgloszenia>(
    `/admin/applications?status=new&sort=created_at&per_page=${PER_PAGE_MAX}`,
  );
  return { pozycje: data.map(mapujZgloszenie), total: meta?.total ?? data.length };
}

async function pobierzDyzury(): Promise<{ pozycje: PozycjaKolejki[]; total: number }> {
  const { data, meta } = await apiPaged<WierszDyzuru>(`/admin/internship/pending?per_page=${PER_PAGE_MAX}`);
  return { pozycje: data.map(mapujDyzur), total: meta?.total ?? data.length };
}

async function pobierzProfile(): Promise<{ pozycje: PozycjaKolejki[]; total: number }> {
  const { data, meta } = await apiPaged<WierszProfilu>(
    `/admin/profiles?status=submitted&per_page=${PER_PAGE_MAX}`,
  );
  return { pozycje: data.map(mapujProfil), total: meta?.total ?? data.length };
}

const ZRODLA: { rodzaj: RodzajSprawy; wywolaj: () => Promise<{ pozycje: PozycjaKolejki[]; total: number }> }[] = [
  { rodzaj: "applications", wywolaj: pobierzZgloszenia },
  { rodzaj: "internship_entries", wywolaj: pobierzDyzury },
  { rodzaj: "profiles", wywolaj: pobierzProfile },
];

/**
 * Pobiera wszystkie trzy źródła RÓWNOLEGLE i NIEZALEŻNIE: błąd jednego
 * źródła nie przerywa pozostałych (KO-8 „błąd jednego źródła"). Kolejność
 * wyniku = `KOLEJNOSC_RODZAJOW`, stała niezależnie od tego, które źródło
 * odpowiedziało pierwsze.
 */
export async function pobierzKolejkeSpraw(): Promise<WynikZrodla[]> {
  return Promise.all(
    ZRODLA.map(async ({ rodzaj, wywolaj }): Promise<WynikZrodla> => {
      try {
        const { pozycje, total } = await wywolaj();
        return { rodzaj, pozycje, blad: null, kodBledu: null, liczbaCalkowita: total };
      } catch (wyjatek) {
        const komunikat =
          wyjatek instanceof ApiError ? wyjatek.message : "Nie udało się pobrać danych źródła.";
        const kod = wyjatek instanceof ApiError ? wyjatek.code : null;
        return { rodzaj, pozycje: [], blad: komunikat, kodBledu: kod, liczbaCalkowita: 0 };
      }
    }),
  );
}
