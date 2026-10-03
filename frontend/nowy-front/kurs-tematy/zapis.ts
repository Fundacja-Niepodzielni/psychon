import type { GrupaTras } from "@/lib/api/h08-tematy";
import { updateInstructorCourse, updateInstructorLesson } from "@/lib/api/prowadzacy-kursy";
import type { AdminCourse } from "@/lib/h08/types";
import { dodajLekcje, zapiszLekcje, type CialoNowejLekcji } from "@/nowy-front/lekcja-edycja/dane";
import { zapiszKurs } from "@/nowy-front/publikacja-kursu/dane";

/**
 * Zapis danych kursu i tytułu lekcji z ekranu „Kurs: tematy i lekcje” — po
 * jednej parze funkcji na grupę tras. Ekran wybiera parę tą samą grupą, którą
 * czyta i zapisuje tematy (`lib/api/h08-tematy.ts`), więc token jednej roli
 * nigdy nie trafia na trasy drugiej.
 *
 *  - prowadzący: `PATCH /instructor/courses/{course}` i
 *    `PATCH /instructor/lessons/{lesson}` (`lib/api/prowadzacy-kursy.ts`);
 *  - administracja: zapis kursu funkcją `zapiszKurs` z „Publikacji kursu”
 *    i zapis lekcji funkcją `zapiszLekcje` z „Edycji lekcji” — adresy obu
 *    tras administracji stoją tylko tam.
 *
 * Obie trasy kursu przyjmują `title` i `description`; trasa administracji
 * dodatkowo identyfikator i typ (grupy produktowej front nie wysyła). Obie trasy lekcji
 * przyjmują samo `title` (pola opcjonalne w `UpdateLessonRequest::rules`).
 */
export interface DaneKursuDoZapisu {
  title: string;
  description: string | null;
}

/** Pola, które zapisuje wyłącznie administracja. */
export interface DaneKursuAdministracji extends DaneKursuDoZapisu {
  slug: string;
  type: AdminCourse["type"];
}

export interface ZapisKursu {
  daneKursu: (idKursu: number, dane: DaneKursuDoZapisu | DaneKursuAdministracji) => Promise<AdminCourse>;
  tytulLekcji: (idLekcji: number, title: string) => Promise<{ title: string }>;
  /**
   * Założenie lekcji w temacie, na tym ekranie. Bez tej funkcji „Dodaj lekcję”
   * prowadzi do ekranu, na którym grupa zakłada lekcje (`adresDodaniaLekcji`).
   */
  nowaLekcja?: (idKursu: number, cialo: CialoNowejLekcji) => Promise<LekcjaPoDodaniu>;
}

/** Tyle z nowej lekcji, ile potrzebuje drzewo tematów. */
export interface LekcjaPoDodaniu {
  id: number;
  title: string;
  topic_id: number | null;
  duration_seconds: number;
}

const ZAPIS: Record<GrupaTras, ZapisKursu> = {
  instructor: {
    daneKursu: (idKursu, dane) =>
      updateInstructorCourse(idKursu, { title: dane.title, description: dane.description }),
    tytulLekcji: (idLekcji, title) => updateInstructorLesson(idLekcji, { title }),
  },
  admin: {
    daneKursu: (idKursu, dane) => zapiszKurs(idKursu, dane),
    tytulLekcji: (idLekcji, title) => zapiszLekcje(idLekcji, { title }),
    nowaLekcja: (idKursu, cialo) => dodajLekcje(idKursu, cialo),
  },
};

export function zapisDlaGrupy(grupa: GrupaTras): ZapisKursu {
  return ZAPIS[grupa];
}

/** Teksty ekranu, które zależą od tego, czyj to ekran. */
export interface TekstyGrupy {
  okruszki: { etykieta: string; href?: string }[];
  rolaOdmowy: string;
  /** Adres ekranu, na którym dziś zakłada się lekcję. */
  adresDodaniaLekcji: (idKursu: number) => string;
}

const TEKSTY: Record<GrupaTras, TekstyGrupy> = {
  instructor: {
    okruszki: [{ etykieta: "Kursy" }, { etykieta: "Tematy i lekcje" }],
    rolaOdmowy: "prowadzących",
    adresDodaniaLekcji: (idKursu) => `/prowadzacy/kursy/${idKursu}`,
  },
  admin: {
    okruszki: [{ etykieta: "Kursy", href: "/admin/kursy" }, { etykieta: "Tematy i lekcje" }],
    rolaOdmowy: "administracji",
    adresDodaniaLekcji: (idKursu) => `/admin/kursy/${idKursu}`,
  },
};

export function tekstyDlaGrupy(grupa: GrupaTras): TekstyGrupy {
  return TEKSTY[grupa];
}
