import type { InstructorQuestion } from "@/lib/questions";
import type { InstructorGroup, InstructorSlot } from "@/lib/h12/types";
import type { DanePulpitu, KursProwadzacego } from "../dane";

/** Stały „teraz” testów — terminy w atrapach są względem niego. */
export const TERAZ = new Date("2026-10-01T10:00:00Z");

export function pytanie(id: number, nadpisania: Partial<InstructorQuestion> = {}): InstructorQuestion {
  return {
    id,
    lesson_id: 21,
    question: "Jak zacząć rozmowę z osobą w kryzysie?",
    answer: null,
    answered_by: null,
    answered_by_name: null,
    answered_at: null,
    created_at: "2026-09-30T08:00:00Z",
    updated_at: "2026-09-30T08:00:00Z",
    user: { id: 17, first_name: "Marta", last_name: "Demo" },
    lesson: { id: 21, title: "Wprowadzenie do wywiadu", course: { id: 2, slug: "wywiad", title: "Wywiad psychologiczny" } },
    ...nadpisania,
  };
}

export function termin(id: number, startsAt: string): InstructorSlot {
  return {
    id,
    starts_at: startsAt,
    duration_minutes: 90,
    seats_limit: 8,
    location_or_link: "https://example.org/spotkanie",
    active_signups_count: 3,
    available_seats: 5,
    can_mark_attendance: false,
    signups: [],
  };
}

export function grupa(liczbaOsob: number, terminy: InstructorSlot[] = []): InstructorGroup {
  return {
    members: Array.from({ length: liczbaOsob }, (_, i) => ({
      id: 100 + i,
      first_name: `Osoba${i + 1}`,
      last_name: "Demo",
      progress: {
        courses_done: 2,
        courses_total: 10,
        hours_accepted: "41.5",
        supervision_present: 5,
        workshop_done: false,
        path_tests_passed: 1,
        path_tests_total: 10,
      },
    })),
    slots: terminy,
  } as InstructorGroup;
}

export function kurs(id: number): KursProwadzacego {
  return { id, slug: `kurs-${id}`, title: `Kurs ${id}`, sequence_order: id };
}

export function pulpit(nadpisania: Partial<DanePulpitu> = {}): DanePulpitu {
  return {
    pytania: { stan: "ok", dane: { liczba: 2, wiersze: [pytanie(1), pytanie(2)] } },
    grupa: { stan: "ok", dane: grupa(2, [termin(7, "2026-10-05T16:00:00Z")]) },
    kursy: { stan: "ok", dane: [kurs(2), kurs(3)] },
    ...nadpisania,
  };
}
