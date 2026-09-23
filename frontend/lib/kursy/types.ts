/**
 * Panel prowadzącego — lista własnych kursów (`GET /instructor/courses`,
 * `MyInstructorProfileController::courses`, pakiet H09). Pola minimalne —
 * kontroler zwraca podzbiór `AdminCourse` potrzebny wyłącznie do wypisania
 * listy i przejścia do karty kursu (`lib/h08/types.ts` niesie pełny zasób).
 */
export interface InstructorCourseSummary {
  id: number;
  slug: string;
  title: string;
  sequence_order: number | null;
}
