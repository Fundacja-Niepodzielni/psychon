/**
 * Wyliczenie „wznowienia" na pulpicie kursów studenta (U-02,
 * `02-MAPA-EKRANOW.md` w. 85). Czysta funkcja — bez `fetch` i bez stanu
 * Reacta — więc daje się przetestować tabelarycznie
 * (`__tests__/wznow-lekcje.test.ts`).
 *
 * Dane wejściowe: `GET /courses` (`backend/routes/api/h05.php:23`) — dla roli
 * `student` katalog niesie wyłącznie kursy poza ścieżką
 * (`sequence_order = null`, `backend/app/Queries/CourseCatalogQuery.php`,
 * gałąź `student`) — oraz `GET /courses/{slug}` (`h05.php:24`) dla kursu
 * wskazanego przez tę funkcję; szczegóły lekcji (`h06.php:114`) czyta dopiero
 * ekran lekcji.
 *
 * Gałęzie:
 *  1. pierwszy kurs `in_progress` (kolejność z API) z nieukończoną lekcją →
 *     `lekcja`;
 *  2. ten kurs, ale wszystkie jego lekcje ukończone → `kurs` (otwórz kurs);
 *  3. wszystkie kursy `completed` → `wszystko-ukonczone`;
 *  4. brak kursów albo żaden nie jest w toku → `brak`.
 */
import type { KursSciezki, LekcjaKursu } from "./nastepny-krok";

export type WznowienieStudenta =
  | { rodzaj: "lekcja"; kurs: KursSciezki; lekcja: LekcjaKursu }
  | { rodzaj: "kurs"; kurs: KursSciezki }
  | { rodzaj: "wszystko-ukonczone" }
  | { rodzaj: "brak" };

/** Kurs, do którego wraca „Wznów lekcję" — pierwszy w toku, w kolejności z API. */
export function kursDoWznowienia(kursy: KursSciezki[]): KursSciezki | undefined {
  return kursy.find((kurs) => kurs.status === "in_progress");
}

/**
 * `lekcjeKursu` to lekcje kursu wskazanego przez `kursDoWznowienia` (puste,
 * gdy takiego kursu nie ma). Ekran nie wywołuje tej funkcji, dopóki szczegóły
 * kursu się ładują, więc „jeszcze się ładuje" nie zostaje wzięte za „brak".
 */
export function wyliczWznowienie(kursy: KursSciezki[], lekcjeKursu: LekcjaKursu[]): WznowienieStudenta {
  const wToku = kursDoWznowienia(kursy);

  if (wToku) {
    const lekcja = lekcjeKursu
      .slice()
      .sort((a, b) => a.sequence_order - b.sequence_order)
      .find((kandydat) => !kandydat.is_completed);
    return lekcja ? { rodzaj: "lekcja", kurs: wToku, lekcja } : { rodzaj: "kurs", kurs: wToku };
  }

  if (kursy.length > 0 && kursy.every((kurs) => kurs.status === "completed")) {
    return { rodzaj: "wszystko-ukonczone" };
  }

  return { rodzaj: "brak" };
}
