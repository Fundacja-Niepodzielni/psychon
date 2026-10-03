import {
  ApiError,
  fetchAdminSupervisionCases,
  type SupervisionCase,
  type SupervisionCasePerson,
} from "@/lib/api";
import { formatujDate } from "../wspolne/daty";

/**
 * Sekcja „Sprawy zgłoszone przez prowadzących” ekranu A-02: lista spraw, które
 * prowadzący zgłosili administracji (`GET /admin/supervision/cases`,
 * `backend/routes/api/h12.php:51`). Trasy nie ma w kontrakcie API — ekran
 * używa istniejącej funkcji `fetchAdminSupervisionCases`, tej samej co
 * dotychczasowy ekran spraw; nowej trasy ani zmiany zaplecza nie ma.
 *
 * Funkcja nigdy nie rzuca: wynik niesie albo listę, albo komunikat błędu,
 * albo znacznik odmowy (401/403), z którego ekran robi stan „brak
 * uprawnień” dla całej strony.
 */

export const TEKST_BRAK_ZGLASZAJACEGO = "Autor zgłoszenia nieznany";
export const TEKST_SPRAWA_OGOLNA = "Sprawa ogólna — bez wskazania osoby";
export const KOMUNIKAT_BLEDU_DOMYSLNY = "Nie udało się wczytać zgłoszonych spraw. Spróbuj ponownie.";

export interface SprawaProwadzacego {
  id: number;
  temat: string;
  data: string;
  /** `created_at` sprawy (ISO 8601) — od niej liczy się wiek sprawy w wierszu. */
  czekaOd: string;
  /** „Zgłoszone przez: Imię Nazwisko” albo tekst zastępczy. */
  zglaszajacy: string;
  /** Imię i nazwisko osoby albo tekst sprawy ogólnej. */
  osoba: string;
  tresc: string;
}

export interface WynikSprawProwadzacych {
  sprawy: SprawaProwadzacego[];
  blad: string | null;
  odmowa: boolean;
}

function imieNazwisko(osoba: SupervisionCasePerson): string {
  return `${osoba.first_name} ${osoba.last_name}`;
}

export function mapujSprawe(sprawa: SupervisionCase): SprawaProwadzacego {
  return {
    id: sprawa.id,
    temat: sprawa.subject,
    data: formatujDate(sprawa.created_at),
    czekaOd: sprawa.created_at,
    // `reporter` gubi się z koperty, gdy relacja nie jest dociągnięta po
    // stronie API (`whenLoaded`); `volunteer` zostaje jako `null`.
    zglaszajacy: sprawa.reporter ? `Zgłoszone przez: ${imieNazwisko(sprawa.reporter)}` : TEKST_BRAK_ZGLASZAJACEGO,
    osoba: sprawa.volunteer ? imieNazwisko(sprawa.volunteer) : TEKST_SPRAWA_OGOLNA,
    tresc: sprawa.body,
  };
}

export async function pobierzSprawyProwadzacych(): Promise<WynikSprawProwadzacych> {
  try {
    const { data } = await fetchAdminSupervisionCases();
    return { sprawy: data.map(mapujSprawe), blad: null, odmowa: false };
  } catch (wyjatek) {
    if (wyjatek instanceof ApiError && (wyjatek.status === 401 || wyjatek.status === 403)) {
      return { sprawy: [], blad: null, odmowa: true };
    }
    return {
      sprawy: [],
      blad: wyjatek instanceof ApiError ? wyjatek.message : KOMUNIKAT_BLEDU_DOMYSLNY,
      odmowa: false,
    };
  }
}
