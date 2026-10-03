import { api } from "@/lib/api/klient";
import type {
  CialoLekcji,
  CialoNowejLekcji,
  LekcjaAdmin,
  StanNagrania,
  ZlecenieWgrania,
} from "@/nowy-front/lekcja-edycja/dane";

/**
 * Trasy prowadzącego dla ekranu kursu i strony lekcji, których nie ma
 * w `lib/api/prowadzacy-kursy.ts` albo które mają tam inny kształt ciała.
 * Te same zasoby co trasy administracji (`AdminLessonResource`,
 * `AdminMaterialResource`, odpowiedzi kontrolera nagrań), inna grupa tras:
 *  - lekcje kursu i zapis lekcji z tematem i treścią (`backend/routes/api/h08.php`, grupa `role:instructor`);
 *  - listy plików lekcji (`GET /instructor/lessons/{lesson}/materials`) zaplecze jeszcze nie ma — tu jej nie ma,
 *    a strona lekcji prowadzącego nie pokazuje karty plików;
 *  - nagranie: `POST /instructor/lessons/{lesson}/video-uploads` i `GET /instructor/lessons/{lesson}/video-status`
 *    — trasy zaplecza w budowie; ekran woła je dopiero po włączeniu `NAGRANIE_PROWADZACEGO`.
 */

/** Wszystkie lekcje kursu prowadzącego, w kształcie zasobu lekcji administracji. */
export function pobierzLekcjeKursuProwadzacego(idKursu: number): Promise<LekcjaAdmin[]> {
  return api<LekcjaAdmin[]>(`/instructor/courses/${idKursu}/lessons`);
}

/** Nowa lekcja w temacie — to samo ciało co u administracji (`topic_id` wskazuje temat). */
export function dodajLekcjeProwadzacego(idKursu: number, cialo: CialoNowejLekcji): Promise<LekcjaAdmin> {
  return api<LekcjaAdmin>(`/instructor/courses/${idKursu}/lessons`, { method: "POST", body: cialo });
}

/** Zapis lekcji: pełne ciało formularza albo samo `title`; bez identyfikatora nagrania. */
export function zapiszLekcjeProwadzacego(
  idLekcji: number,
  cialo: CialoLekcji | Pick<CialoLekcji, "title">,
): Promise<LekcjaAdmin> {
  return api<LekcjaAdmin>(`/instructor/lessons/${idLekcji}`, { method: "PATCH", body: cialo });
}

export function pobierzStanNagraniaProwadzacego(idLekcji: number): Promise<StanNagrania> {
  return api<StanNagrania>(`/instructor/lessons/${idLekcji}/video-status`);
}

/** Ciało dokładnie `{ title }`, jak przy zleceniu wgrania administracji. */
export function zlecWgranieNagraniaProwadzacego(idLekcji: number, title: string): Promise<ZlecenieWgrania> {
  return api<ZlecenieWgrania>(`/instructor/lessons/${idLekcji}/video-uploads`, {
    method: "POST",
    body: { title },
  });
}
