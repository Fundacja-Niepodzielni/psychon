/**
 * Dane ekranu „Moje kursy” (uczestnik). Dokładnie te trasy co stara lista kursów i pulpit:
 *  - `GET /courses` (bez zapytania) — lista kursów;
 *  - `GET /courses/{slug}` — wyłącznie szczegóły kursu w toku, żeby przycisk „Wróć do lekcji”
 *    znał pierwszą nieukończoną lekcję (ta sama trasa, której używa pulpit i strona kursu).
 *
 * Odczyty biegną z przeglądarki — ten sam powód co w `nowy-front/pulpit/dane.ts`.
 */
export { pobierzKursy, pobierzSzczegolKursu, type KursSciezki, type LekcjaKursu } from "../pulpit/dane";
