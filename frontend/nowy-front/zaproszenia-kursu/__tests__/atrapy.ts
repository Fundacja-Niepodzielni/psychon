import type { AdminCourse } from "@/lib/h08/types";
import type { AdminUserListItem } from "@/lib/api/h18";

/**
 * Atrapy odpowiedzi ekranu „Zaproszenia na kurs”. Klucze są kluczami zasobów
 * zaplecza (`AdminCourseResource`, `AdminUserListResource::FIELDS`); test
 * schematu czyta te pliki i porównuje je z kluczami poniżej.
 */
/** Wpis listy braków kursu (`AdminCourseResource`, pole `publication_gaps`). */
type BrakKursu = { code: string; lesson_id: number | null };

/** Kurs z zasobu zaplecza razem z polem `publication_gaps`, którego typ `AdminCourse` nie niesie. */
type KursZBrakami = AdminCourse & { publication_gaps: { blocking: BrakKursu[]; waiting: BrakKursu[] } };

export const KURS_SPOTKANIE: KursZBrakami = {
  id: 7,
  title: "Spotkanie o pracy z kryzysem",
  slug: "spotkanie-o-pracy-z-kryzysem",
  description: null,
  type: "webinar",
  product_group: "psychon",
  sequence_order: null,
  edition_id: 1,
  is_published: true,
  lessons_count: 0,
  materials_count: 0,
  created_at: "2026-09-01T08:00:00Z",
  updated_at: "2026-09-01T08:00:00Z",
  publication_gaps: { blocking: [], waiting: [] },
};

export const KURS_NA_SCIEZCE: AdminCourse = { ...KURS_SPOTKANIE, id: 8, type: "course", sequence_order: 3 };

export const KURS_BEZ_KOLEJNOSCI: AdminCourse = { ...KURS_SPOTKANIE, id: 9, type: "course", sequence_order: null };

function osoba(id: number, imie: string, nazwisko: string, rola: "volunteer" | "student"): AdminUserListItem {
  return {
    id,
    first_name: imie,
    last_name: nazwisko,
    email: `${imie.toLowerCase()}@demo.pl`,
    role: rola,
    status: "active",
    product_group: "psychon",
    access_expires_at: "2027-02-01T00:00:00Z",
    program_completed_at: null,
    created_at: "2026-08-01T08:00:00Z",
  };
}

export const WOLONTARIUSZE: AdminUserListItem[] = [osoba(17, "Marta", "Kowalska", "volunteer"), osoba(18, "Ewa", "Nowak", "volunteer")];
export const STUDENCI: AdminUserListItem[] = [osoba(21, "Filip", "Adamski", "student")];

export function strona(dane: AdminUserListItem[], lacznie = dane.length) {
  return { data: dane, meta: { current_page: 1, per_page: 100, total: lacznie, last_page: 1 } };
}
