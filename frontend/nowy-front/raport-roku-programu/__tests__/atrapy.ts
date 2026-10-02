import type { OsobaZestawienia, RaportRokuProgramu } from "../dane";

/**
 * Atrapy ekranu „Raport roku programu” w kształcie odpowiedzi
 * `GET /admin/report` (bloki `edition`, `period`, `program`, `students`,
 * `people`). Osoby z danych przykładowych seeda (Marta, Ola, Filip Demo)
 * i jedna osoba spoza okresu (Tomek Demo); bez prawdziwych danych.
 */

export function osoba(nadpisz: Partial<OsobaZestawienia> = {}): OsobaZestawienia {
  return {
    id: 101,
    first_name: "Marta",
    last_name: "Demo",
    role: "volunteer",
    status: "active",
    courses_done: 8,
    courses_total: 10,
    internship: { done: "41.5", required: "72" },
    supervision: { attended: 5, required: 6 },
    workshop_completed_at: null,
    hours_accepted: "41.5",
    consultations: 37,
    certificate_valid: false,
    ...nadpisz,
  };
}

export const OSOBY: OsobaZestawienia[] = [
  osoba(),
  osoba({
    id: 102,
    first_name: "Ola",
    courses_done: 10,
    internship: { done: "72", required: "72" },
    supervision: { attended: 6, required: 6 },
    workshop_completed_at: "2026-09-18T10:00:00Z",
    hours_accepted: "72",
    consultations: 64,
    certificate_valid: true,
  }),
  osoba({ id: 103, first_name: "Tomek", courses_done: 1, internship: { done: "3", required: "72" }, supervision: { attended: 0, required: 6 }, hours_accepted: "0", consultations: 0 }),
  osoba({ id: 104, first_name: "Filip", role: "student", courses_done: 2, internship: null, supervision: null, hours_accepted: "0", consultations: 0 }),
];

export function raport(nadpisz: Partial<RaportRokuProgramu> = {}): RaportRokuProgramu {
  return {
    edition: { id: 1, name: "Edycja 2026", starts_at: "2026-01-01", ends_at: null },
    period: { from: null, to: null },
    program: {
      admitted: 4,
      active: 3,
      completed: 1,
      with_passed_test: 1,
      certificates_valid: 1,
      hours_accepted_total: "21.5",
      hours_accepted_average: "7.2",
      consultations_total: 15,
    },
    students: { active: 2, completed: 1 },
    people: OSOBY,
    ...nadpisz,
  };
}

/** Rok programu bez żadnej osoby: zera i puste zestawienie. */
export function pustyRok(): RaportRokuProgramu {
  return raport({
    program: {
      admitted: 0,
      active: 0,
      completed: 0,
      with_passed_test: 0,
      certificates_valid: 0,
      hours_accepted_total: "0",
      hours_accepted_average: "0",
      consultations_total: 0,
    },
    students: { active: 0, completed: 0 },
    people: [],
  });
}
