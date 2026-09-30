import { apiPaged, ApiError } from "@/lib/api/klient";

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

/** Stała kolejność rodzajów — rozstrzyga remis w `znajdzNajstarszaSprawe`
 * i kolejność sekcji błędów źródeł. Ta sama kolejność co klucze
 * `queues` w `DashboardSummary::build()` (bez `questions`, patrz wyżej). */
export const KOLEJNOSC_RODZAJOW: RodzajSprawy[] = ["applications", "internship_entries", "profiles"];

export const ETYKIETA_RODZAJU: Record<RodzajSprawy, string> = {
  applications: "Zgłoszenie",
  internship_entries: "Dyżur",
  profiles: "Profil psychologa",
};

/** Jeden element jednolitej kolejki, niezależnie od źródła. */
export interface PozycjaKolejki {
  id: string;
  /** Numeryczny identyfikator ŹRÓDŁOWEGO rekordu (bez przedrostka rodzaju) —
   * jedyne pole używane do rozstrzygania remisu w `znajdzNajstarszaSprawe`.
   * `id` (string) NIE nadaje się do tego porównania: porównanie leksykalne
   * `"applications-20" < "applications-5"` jest prawdziwe (znak '2' < '5'),
   * mimo że 20 > 5 — zmierzone przez test tabelaryczny
   * `__tests__/najstarsza-sprawa.test.ts`, nie założone. */
  idLiczbowe: number;
  rodzaj: RodzajSprawy;
  tytul: string;
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

function formatujDate(iso: string | null): string {
  if (!iso) return "nieznana data";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "nieznana data";
  return data.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
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

export function mapujZgloszenie(wiersz: WierszZgloszenia): PozycjaKolejki {
  return {
    id: `applications-${wiersz.id}`,
    idLiczbowe: wiersz.id,
    rodzaj: "applications",
    tytul: `${ETYKIETA_RODZAJU.applications} — ${wiersz.first_name} ${wiersz.last_name}`,
    podpowiedz: `Czeka od ${formatujDate(wiersz.created_at)}`,
    czekaOd: wiersz.created_at ?? "",
    // Brak trasy szczegółu zgłoszenia `new` (karta `/admin/uczestniczki/{id}`
    // to H18 „karta osoby", klucz user.id — osoba jeszcze nie istnieje przed
    // akceptacją). Prowadzi do listy z zakładką zgłoszeń, tak jak wpina ją
    // `AdminUsersPage` (`frontend/app/(administracja)/admin/uczestniczki/page.tsx:26-29`).
    href: "/admin/uczestniczki?zakladka=zgloszenia",
  };
}

export function mapujDyzur(wiersz: WierszDyzuru): PozycjaKolejki {
  return {
    id: `internship_entries-${wiersz.id}`,
    idLiczbowe: wiersz.id,
    rodzaj: "internship_entries",
    tytul: `${ETYKIETA_RODZAJU.internship_entries} — ${wiersz.user.first_name} ${wiersz.user.last_name}`,
    podpowiedz: `Czeka od ${formatujDate(wiersz.created_at)}`,
    czekaOd: wiersz.created_at ?? "",
    // Brak trasy szczegółu pojedynczego dyżuru — tylko lista
    // (`frontend/app/(administracja)/admin/staz/page.tsx`), tak jak linkuje
    // `DashboardSummary::build()` (`link` klucza `internship_entries`).
    href: "/admin/staz",
  };
}

export function mapujProfil(wiersz: WierszProfilu): PozycjaKolejki {
  return {
    id: `profiles-${wiersz.id}`,
    idLiczbowe: wiersz.id,
    rodzaj: "profiles",
    tytul: `${ETYKIETA_RODZAJU.profiles} — ${wiersz.user.first_name} ${wiersz.user.last_name}`,
    podpowiedz: `Czeka od ${formatujDate(wiersz.created_at)}`,
    czekaOd: wiersz.created_at ?? "",
    href: `/admin/profile/${wiersz.id}`,
  };
}

/**
 * Najstarsza sprawa: najwcześniejsza `czekaOd` po wszystkich pozycjach.
 * Remis (ta sama chwila) rozstrzyga stała kolejność `KOLEJNOSC_RODZAJOW`,
 * dalszy remis (ten sam rodzaj) — rosnąco po `id`. Pozycja bez daty
 * (`czekaOd === ""`) nigdy nie wygrywa, dopóki istnieje choć jedna pozycja
 * z datą — czysta funkcja, bez efektów ubocznych, testowana tabelarycznie
 * w `__tests__/najstarsza-sprawa.test.ts`.
 */
export function znajdzNajstarszaSprawe(pozycje: PozycjaKolejki[]): PozycjaKolejki | null {
  if (pozycje.length === 0) return null;
  return pozycje.reduce((najstarsza, kandydat) =>
    jestWczesniejszaLubRownaZRemisem(kandydat, najstarsza) ? kandydat : najstarsza,
  );
}

function jestWczesniejszaLubRownaZRemisem(a: PozycjaKolejki, b: PozycjaKolejki): boolean {
  const czasA = Date.parse(a.czekaOd);
  const czasB = Date.parse(b.czekaOd);
  const aMaDate = !Number.isNaN(czasA);
  const bMaDate = !Number.isNaN(czasB);
  if (aMaDate && !bMaDate) return true;
  if (!aMaDate && bMaDate) return false;
  if (aMaDate && bMaDate && czasA !== czasB) return czasA < czasB;
  // Remis (obie bez daty, albo ta sama chwila): stała kolejność rodzajów,
  // potem `idLiczbowe` rosnąco — deterministyczne, niezależne od kolejności
  // wejścia. Porównanie MUSI być liczbowe (`idLiczbowe`), nie leksykalne na
  // `id` (string) — patrz komentarz przy polu `idLiczbowe` w `PozycjaKolejki`.
  const indeksA = KOLEJNOSC_RODZAJOW.indexOf(a.rodzaj);
  const indeksB = KOLEJNOSC_RODZAJOW.indexOf(b.rodzaj);
  if (indeksA !== indeksB) return indeksA < indeksB;
  return a.idLiczbowe < b.idLiczbowe;
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
