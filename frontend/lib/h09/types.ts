/**
 * Pakiet H09 · typy DTO przypisań prowadzących do kursów i lekcji.
 *
 * Wywołania idą przez generyczne `api<T>()` / `apiPaged<T>()` z `lib/api.ts` —
 * pakiet nie dokłada własnych funkcji klienta API.
 */

export interface AssignmentInstructor {
  id: number;
  first_name: string;
  last_name: string;
}

/**
 * Wiersz `course_assignments`. `lesson_id = null` oznacza przypisanie całego
 * kursu — obejmuje wtedy każdą lekcję, która nie ma własnego przypisania.
 * Odłączenie nie kasuje wiersza (ustawia `unassigned_at`); ten endpoint
 * zwraca wyłącznie przypisania z `unassigned_at = null`.
 */
export interface CourseAssignment {
  id: number;
  course_id: number;
  lesson_id: number | null;
  instructor: AssignmentInstructor;
  assigned_by: number | null;
  assigned_at: string | null;
  unassigned_at: string | null;
}

/** Pozycja katalogu prowadzących — tylko pola potrzebne do wyboru z listy. */
export interface InstructorDirectoryEntry {
  id: number;
  first_name: string;
  last_name: string;
}
