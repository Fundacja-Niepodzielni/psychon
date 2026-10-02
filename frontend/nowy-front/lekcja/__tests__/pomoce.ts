import type { DaneLekcji } from "../dane";
import type { OdczytKursu } from "../kurs";

/** Dane przykładowe lekcji w układzie ekranu: 20 min nagrania, 16 min wymaganych, 12. minuta przerwania. */
export const TRESC_LEKCJI =
  "## Po co ta lekcja\n\nKryzys psychiczny nie zawsze wygląda jak kryzys.\n\n- sygnał pierwszy\n- sygnał drugi\n\nPrzeczytaj to **uważnie**.";

export const LEKCJA: DaneLekcji = {
  id: 21,
  title: "Rozpoznawanie kryzysu psychicznego",
  description: "Opis lekcji",
  content: TRESC_LEKCJI,
  topic: { id: 7, title: "Kryzys i jego przebieg", position: 1 },
  course: { id: 3, slug: "pierwsza-pomoc-psychologiczna", title: "Pierwsza pomoc psychologiczna" },
  question_addressee: { name: "Marta Zielińska" },
  required_active_seconds: 960,
  duration_seconds: 1200,
  position_seconds: 0,
  watched_seconds: 720,
  active_seconds: 720,
  is_completed: false,
  completable: false,
  completable_at_percent: 80,
  video_status: "ready",
};

/** Siedem lekcji w temacie „Kryzys i jego przebieg”: dwie ukończone, trzecia to bieżąca (id 21). */
export const KURS: OdczytKursu = {
  slug: "pierwsza-pomoc-psychologiczna",
  topics: [
    { id: 7, title: "Kryzys i jego przebieg", position: 1 },
    { id: 8, title: "Rozmowa z osobą w kryzysie", position: 2 },
  ],
  lessons: [
    { id: 19, title: "Czym jest kryzys", sequence_order: 1, duration_seconds: 600, is_completed: true, topic_id: 7 },
    { id: 20, title: "Fazy kryzysu", sequence_order: 2, duration_seconds: 600, is_completed: true, topic_id: 7 },
    { id: 21, title: "Rozpoznawanie kryzysu psychicznego", sequence_order: 3, duration_seconds: 1200, is_completed: false, topic_id: 7 },
    { id: 22, title: "Rozmowa, która nie ocenia", sequence_order: 4, duration_seconds: 960, is_completed: false, topic_id: 7 },
    { id: 23, title: "Czego unikać", sequence_order: 5, duration_seconds: 600, is_completed: false, topic_id: 7 },
    { id: 24, title: "Ćwiczenie z przykładami", sequence_order: 6, duration_seconds: 600, is_completed: false, topic_id: 7 },
    { id: 25, title: "Podsumowanie tematu", sequence_order: 7, duration_seconds: 600, is_completed: false, topic_id: 7 },
    { id: 31, title: "Pierwsze zdanie rozmowy", sequence_order: 8, duration_seconds: 900, is_completed: false, topic_id: 8 },
  ],
  materials: [
    {
      id: 1,
      name: "Schemat decyzji w kryzysie.pdf",
      size: 246784,
      mime: "application/pdf",
      lesson_id: 21,
      download_url: "https://api.test/materials/1",
    },
    {
      id: 2,
      name: "Numery pomocowe w Polsce.pdf",
      size: 98304,
      mime: "application/pdf",
      lesson_id: 21,
      download_url: "https://api.test/materials/2",
    },
    { id: 3, name: "Cudzy plik.pdf", size: 1000, mime: "application/pdf", lesson_id: 22, download_url: "https://api.test/materials/3" },
  ],
  has_test: true,
};

/** Kopia kursu z innym stanem lekcji (po id) i nadpisanymi polami kursu. */
export function kursZ(nadpisz: Partial<OdczytKursu> = {}): OdczytKursu {
  return { ...KURS, ...nadpisz };
}

/** Nieskończenie długo wiszące zapytanie (stan ładowania). */
export function wiszace<T>(): Promise<T> {
  return new Promise(() => {});
}
