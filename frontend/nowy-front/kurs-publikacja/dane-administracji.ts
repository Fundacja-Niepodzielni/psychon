import { ApiError } from "@/lib/api/klient";
import { pobierzLekcjeKursu } from "@/nowy-front/lekcja-edycja/dane";
import { czyPoprawnyIdentyfikator, pobierzKurs } from "@/nowy-front/publikacja-kursu/dane";
import type { DaneKursu, WynikDanychKursu } from "./dane";

/**
 * Dane kursu dla ekranu administracji — ten sam kształt wyniku co
 * `pobierzDaneKursu` (`./dane.ts`), ale z tras administracji:
 * `GET /admin/courses/{course}` i `GET /admin/courses/{course}/lessons`
 * (`backend/routes/api/h08.php:37,43`).
 *
 * Obie trasy woła istniejącymi funkcjami sekcji administracji (`pobierzKurs`
 * z „Publikacji kursu”, `pobierzLekcjeKursu` z „Edycji lekcji”), więc adres
 * żadnej z nich nie jest zapisany drugi raz. Odczyt biegnie z przeglądarki,
 * z tokenem sesji przez wspólny klient — dlatego funkcja stoi w osobnym pliku,
 * a nie w `dane.ts`, które czyta strona serwerowa prowadzącego.
 *
 * Różnica wobec prowadzącego, celowa: błąd odczytu lekcji daje `blad`, a nie
 * pustą listę — ekran administracji zapisuje układ kursu i nie może udawać,
 * że kurs nie ma lekcji.
 */
export async function pobierzDaneKursuAdministracji(
  idKursu: string,
): Promise<WynikDanychKursu | { status: "nie-znaleziono" }> {
  if (!czyPoprawnyIdentyfikator(idKursu)) return { status: "blad" };

  try {
    const [kurs, lekcje] = await Promise.all([pobierzKurs(idKursu), pobierzLekcjeKursu(Number(idKursu))]);
    const dane: DaneKursu = { kurs, lekcje };
    if (lekcje.length === 0 && kurs.materials_count === 0) return { status: "pusty", dane };
    return { status: "ok", dane };
  } catch (blad) {
    // Trzy odmowy, trzy stany: wygasła sesja, brak roli, brak kursu.
    if (blad instanceof ApiError && blad.status === 401) return { status: "brak-sesji" };
    if (blad instanceof ApiError && blad.status === 403) return { status: "brak-uprawnien" };
    if (blad instanceof ApiError && blad.status === 404) return { status: "nie-znaleziono" };
    return { status: "blad" };
  }
}
