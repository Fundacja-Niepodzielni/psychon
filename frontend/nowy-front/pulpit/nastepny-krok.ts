/**
 * Wyliczenie „następnego kroku" na pulpicie uczestnika (U-01,
 * `02-MAPA-EKRANOW.md` w. 84, rola wolontariusz).
 *
 * Czysta funkcja — bez `fetch`, bez stanu Reacta — żeby dało się ją
 * przetestować tabelarycznie (patrz `__tests__/nastepny-krok.test.ts`).
 * Dane wejściowe pochodzą z dwóch tras H05: `GET /courses`
 * (`backend/routes/api/h05.php:23`, kształt `CourseListResource`) i
 * `GET /courses/{slug}` (`backend/routes/api/h05.php:24`, kształt
 * `CourseDetailResource`/`LessonSummaryResource`) — obie w
 * `backend/app/Http/Resources/CourseListResource.php` i
 * `backend/app/Http/Resources/CourseDetailResource.php`.
 *
 * Gałęzie:
 *  1. etap `in_progress` + jego pierwsza nieukończona lekcja → `lekcja`;
 *  2. ten sam etap, ale wszystkie jego lekcje ukończone (test jeszcze nie
 *     zdany) → `test`;
 *  3. cała ścieżka `completed` → `certyfikat`;
 *  4. program zamknięty (`GET /me` → `program_completed_at`) → `po-programie`,
 *     przed wszystkimi powyższymi — ukończony program nie wraca do lekcji;
 *  5. inaczej (ścieżka pusta albo pierwszy etap jeszcze niedostępny) → `brak`.
 */
import { minutyZSekund } from "../lekcja/stan";

export type StatusKursu = "locked" | "in_progress" | "completed";

/** Podzbiór `CourseListResource` potrzebny do wyliczenia kroku i do `StatRow`. */
export interface KursSciezki {
  id: number;
  slug: string;
  title: string;
  sequence_order: number | null;
  status: StatusKursu;
  progress_percent: number;
}

/** `LessonSummaryResource` — lekcja etapu w toku. */
export interface LekcjaKursu {
  id: number;
  title: string;
  sequence_order: number;
  is_completed: boolean;
  /** Czas trwania lekcji w sekundach (`LessonSummaryResource`); odpowiedzi sprzed tego pola go nie niosą. */
  duration_seconds?: number;
  /** Czas aktywny zalogowanej osoby w lekcji; brak postępu: 0. */
  active_seconds?: number;
  /** Czy lekcja ma nagranie; lekcja bez nagrania nie ma czasu do obejrzenia. */
  has_recording?: boolean;
}

export type NastepnyKrok =
  | { rodzaj: "lekcja"; kurs: KursSciezki; lekcja: LekcjaKursu }
  | { rodzaj: "test"; kurs: KursSciezki }
  | { rodzaj: "certyfikat" }
  | { rodzaj: "po-programie" }
  | { rodzaj: "brak" };

/**
 * Etapy ścieżki wolontariusza — kursy z `sequence_order`, posortowane
 * rosnąco. Webinary/zaproszenia (`sequence_order: null`, rola `student`,
 * `CourseCatalogQuery::visibleTo`) nie należą do tej ścieżki i tu się nie
 * liczą — U-01 jest ekranem wolontariusza (U-02 studenta ma inny widok).
 */
export function etapySciezki(kursy: KursSciezki[]): KursSciezki[] {
  return kursy
    .filter((kurs) => kurs.sequence_order !== null)
    .slice()
    .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));
}

function pierwszaNieukonczonaLekcja(lekcje: LekcjaKursu[]): LekcjaKursu | undefined {
  return lekcje
    .slice()
    .sort((a, b) => a.sequence_order - b.sequence_order)
    .find((lekcja) => !lekcja.is_completed);
}

/**
 * `lekcjeEtapu` to lekcje etapu W TOKU (puste, gdy nie ma etapu w toku albo
 * gdy jego szczegóły jeszcze się nie liczą tutaj — component pokazuje wtedy
 * `Skeleton`/`Notice` i NIE wywołuje tej funkcji, żeby „jeszcze się ładuje"
 * nie zostało wzięte za „brak").
 */
export function wyliczNastepnyKrok(
  kursy: KursSciezki[],
  lekcjeEtapu: LekcjaKursu[],
  programUkonczony = false,
): NastepnyKrok {
  if (programUkonczony) {
    return { rodzaj: "po-programie" };
  }

  const etapy = etapySciezki(kursy);
  const wToku = etapy.find((kurs) => kurs.status === "in_progress");

  if (wToku) {
    const lekcja = pierwszaNieukonczonaLekcja(lekcjeEtapu);
    if (lekcja) {
      return { rodzaj: "lekcja", kurs: wToku, lekcja };
    }
    return { rodzaj: "test", kurs: wToku };
  }

  if (etapy.length > 0 && etapy.every((kurs) => kurs.status === "completed")) {
    return { rodzaj: "certyfikat" };
  }

  return { rodzaj: "brak" };
}

/**
 * Zdanie „obejrzane 12 z 20 minut” do podpisu następnego kroku — z czasu aktywnego
 * i czasu trwania lekcji (`active_seconds`, `duration_seconds` z `GET /courses/{slug}`).
 * Bez nagrania, bez czasu trwania albo bez ani jednej pełnej minuty oglądania: `null`
 * (karta zostaje przy samym kursie). Forma bez rodzaju gramatycznego.
 */
export function zdanieObejrzanychMinut(lekcja: LekcjaKursu): string | null {
  if (lekcja.has_recording === false) return null;
  const czas = lekcja.duration_seconds;
  const aktywny = lekcja.active_seconds;
  if (typeof czas !== "number" || czas <= 0 || typeof aktywny !== "number" || aktywny <= 0) return null;
  const razem = minutyZSekund(czas);
  const obejrzane = Math.min(razem, Math.floor(aktywny / 60));
  if (obejrzane === 0) return null;
  return `obejrzane ${obejrzane} z ${razem} ${razem === 1 ? "minuty" : "minut"}`;
}
