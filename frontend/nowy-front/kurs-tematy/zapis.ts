import { api } from "@/lib/api/klient";
import type { GrupaTras } from "@/lib/api/h08-tematy";
import { updateInstructorCourse, updateInstructorLesson } from "@/lib/api/prowadzacy-kursy";
import type { AdminCourse } from "@/lib/h08/types";
import { zapiszLekcje } from "@/nowy-front/lekcja-edycja/dane";

/**
 * Zapis danych kursu i tytułu lekcji z ekranu „Kurs: tematy i lekcje” — po
 * jednej parze funkcji na grupę tras. Ekran wybiera parę tą samą grupą, którą
 * czyta i zapisuje tematy (`lib/api/h08-tematy.ts`), więc token jednej roli
 * nigdy nie trafia na trasy drugiej.
 *
 *  - prowadzący: `PATCH /instructor/courses/{course}` i
 *    `PATCH /instructor/lessons/{lesson}` (`lib/api/prowadzacy-kursy.ts`);
 *  - administracja: `PATCH /admin/courses/{course}` (`backend/routes/api/h08.php:38`)
 *    oraz zapis lekcji funkcją `zapiszLekcje` z „Edycji lekcji” — adres trasy
 *    lekcji administracji stoi tylko tam.
 *
 * Obie trasy kursu przyjmują `title` i `description`; obie trasy lekcji
 * przyjmują samo `title` (pola opcjonalne w `UpdateLessonRequest::rules`).
 */
export interface DaneKursuDoZapisu {
  title: string;
  description: string | null;
}

export interface ZapisKursu {
  daneKursu: (idKursu: number, dane: DaneKursuDoZapisu) => Promise<AdminCourse>;
  tytulLekcji: (idLekcji: number, title: string) => Promise<{ title: string }>;
}

const ZAPIS: Record<GrupaTras, ZapisKursu> = {
  instructor: {
    daneKursu: (idKursu, dane) => updateInstructorCourse(idKursu, dane),
    tytulLekcji: (idLekcji, title) => updateInstructorLesson(idLekcji, { title }),
  },
  admin: {
    daneKursu: (idKursu, dane) =>
      api<AdminCourse>(`/admin/courses/${idKursu}`, { method: "PATCH", body: dane }),
    tytulLekcji: (idLekcji, title) => zapiszLekcje(idLekcji, { title }),
  },
};

export function zapisDlaGrupy(grupa: GrupaTras): ZapisKursu {
  return ZAPIS[grupa];
}

/** Teksty ekranu, które zależą od tego, czyj to ekran. */
export interface TekstyGrupy {
  okruszki: { etykieta: string; href?: string }[];
  naglowekOdmowy: string;
  rolaOdmowy: string;
  /** Adres ekranu, na którym dziś zakłada się lekcję. */
  adresDodaniaLekcji: (idKursu: number) => string;
}

const TEKSTY: Record<GrupaTras, TekstyGrupy> = {
  instructor: {
    okruszki: [{ etykieta: "Kursy" }, { etykieta: "Tematy i lekcje" }],
    naglowekOdmowy: "Tematy kursu dla prowadzących",
    rolaOdmowy: "prowadzących",
    adresDodaniaLekcji: (idKursu) => `/prowadzacy/kursy/${idKursu}`,
  },
  admin: {
    okruszki: [{ etykieta: "Kursy", href: "/admin/kursy" }, { etykieta: "Tematy i lekcje" }],
    naglowekOdmowy: "Tematy kursu dla administracji",
    rolaOdmowy: "administracji",
    adresDodaniaLekcji: (idKursu) => `/admin/kursy/${idKursu}`,
  },
};

export function tekstyDlaGrupy(grupa: GrupaTras): TekstyGrupy {
  return TEKSTY[grupa];
}
