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
import type { CourseType } from "@/lib/courses";
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
  /** Rodzaj pozycji; brak pola (zaplecze bez webinarów) znaczy „kurs”. */
  type?: CourseType;
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

/** Czy pozycja listy to webinar; brak pola `type` (zaplecze bez webinarów) znaczy „kurs”. */
export function jestWebinarem(kurs: { type?: string | null }): boolean {
  return kurs.type === "webinar";
}

/**
 * Etapy ścieżki wolontariusza — KURSY z `sequence_order`, posortowane
 * rosnąco. Webinar nie jest etapem kursu: nie ma lekcji ani testu, nie blokuje
 * następnego kursu i nie bywa „w toku” w rozumieniu następnego kroku, więc tu
 * się nie liczy (zajmuje się nim karta webinaru i warunek certyfikatu).
 * Zaproszenia (`sequence_order: null`, rola `student`,
 * `CourseCatalogQuery::visibleTo`) też nie należą do tej ścieżki — U-01 jest
 * ekranem wolontariusza (U-02 studenta ma inny widok).
 */
export function etapySciezki(kursy: KursSciezki[]): KursSciezki[] {
  return kursy
    .filter((kurs) => kurs.sequence_order !== null && !jestWebinarem(kurs))
    .slice()
    .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));
}

/**
 * Pozycje listy „Twoja ścieżka”: kursy ze ścieżki i wszystkie webinary razem,
 * według numeru w ścieżce (bez numeru na końcu, remis po identyfikatorze).
 * Kurs bez numeru i bez typu to zaproszenie poza ścieżką — nie wchodzi.
 */
export function pozycjeSciezki(kursy: KursSciezki[]): KursSciezki[] {
  return kursy
    .filter((kurs) => jestWebinarem(kurs) || kurs.sequence_order !== null)
    .slice()
    .sort((a, b) => (a.sequence_order ?? Number.POSITIVE_INFINITY) - (b.sequence_order ?? Number.POSITIVE_INFINITY) || a.id - b.id);
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
