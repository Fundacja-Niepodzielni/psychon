/**
 * Rejestr slotów ekranu kursów w administracji (#/admin/kursy — pakiet H08a).
 *
 * Jak dodać swój slot (pakiet HXX):
 * 1. Utwórz komponent w `components/hXX/` i wyeksportuj obok niego obiekt slotu.
 * 2. Dodaj swój slot jedną linią do importów i jedną do listy poniżej.
 *
 * Dzięki temu H08b (materiały, zaproszenia) i H09 (przypisania) rozszerzają
 * kartę kursu, nie edytując plików należących do H08a — dokładnie tak, jak
 * `lib/slots/course-page.ts` dla strony kursu H05.
 */
import type { ComponentType } from "react";
import type { AdminCourse, AdminLesson } from "@/lib/h08/types";
import h08bCourseMaterials from "@/components/h08b/CourseMaterialsPanel";
import h08bCourseInvitePanel from "@/components/h08b/CourseInvitePanel";
// import hXXNazwa from "@/components/hXX/hXXNazwa"; // ← dodaj swój slot jedną linią

export type AdminCoursesRegion =
  | "course-materials"
  | "course-assignments"
  | "course-actions";

export interface AdminCoursesSlotProps {
  course: AdminCourse;
  /**
   * Obecna, gdy region "course-materials" renderuje się w kontekście lekcji.
   * Przy braku lekcji region dotyczy materiałów wpiętych wprost w kurs.
   */
  lesson?: AdminLesson;
}

export interface AdminCoursesSlot {
  /** Identyfikator z prefiksem pakietu, np. "h09-assignment-panel". */
  id: string;
  region: AdminCoursesRegion;
  /** Niższy renderuje się pierwszy. */
  order: number;
  Component: ComponentType<AdminCoursesSlotProps>;
}

export const adminCoursesSlots: AdminCoursesSlot[] = [
  h08bCourseMaterials,
  h08bCourseInvitePanel,
  // hXXNazwa, // ← i drugą tutaj
];

/** Wszystkie sloty regionu, rosnąco wg `order`. Regiony są addytywne. */
export function slotsForRegion(region: AdminCoursesRegion): AdminCoursesSlot[] {
  return adminCoursesSlots
    .filter((slot) => slot.region === region)
    .sort((a, b) => a.order - b.order);
}
