/**
 * Atrapy odpowiedzi zaplecza dla testów ekranu „Moja grupa”. Klucze są właściwościami zasobów
 * `GET /instructor/group` i `GET /instructor/reliability`; dane wyłącznie demonstracyjne — osoby
 * „Marta Demo”, „Filip Demo” i „Zofia Demo”, jak w testach starego ekranu.
 */
import type { InstructorGroup, InstructorSlot, OsobaRzetelnosci } from "../dane";

export const MARTA = { id: 17, first_name: "Marta", last_name: "Demo" };
export const FILIP = { id: 18, first_name: "Filip", last_name: "Demo" };
export const ZOFIA = { id: 19, first_name: "Zofia", last_name: "Demo" };

/** Termin przyszły: obecności jeszcze nie można oznaczać. */
export const TERMIN_PRZYSZLY: InstructorSlot = {
  id: 31,
  starts_at: "2026-10-14T16:00:00Z",
  duration_minutes: 90,
  seats_limit: 3,
  location_or_link: null,
  active_signups_count: 2,
  available_seats: 1,
  can_mark_attendance: false,
  signups: [
    { user: MARTA, signed_up_at: "2026-10-01T08:00:00Z", attendance: null },
    { user: FILIP, signed_up_at: "2026-10-01T09:00:00Z", attendance: null },
  ],
};

/** Termin zakończony: obecności można oznaczać, Marta ma już zapisaną obecność. */
export const TERMIN_ZAKONCZONY: InstructorSlot = {
  id: 30,
  starts_at: "2026-09-30T16:00:00Z",
  duration_minutes: 60,
  seats_limit: 2,
  location_or_link: "sala 4",
  active_signups_count: 2,
  available_seats: 0,
  can_mark_attendance: true,
  signups: [
    { user: MARTA, signed_up_at: "2026-09-20T08:00:00Z", attendance: "present" },
    { user: FILIP, signed_up_at: "2026-09-20T09:00:00Z", attendance: null },
  ],
};

export const TERMIN_PUSTY: InstructorSlot = {
  id: 32,
  starts_at: "2026-11-04T16:00:00Z",
  duration_minutes: 90,
  seats_limit: 3,
  location_or_link: null,
  active_signups_count: 0,
  available_seats: 3,
  can_mark_attendance: false,
  signups: [],
};

/** Grupa trzech osób na różnym etapie: od zera do ukończonego programu. */
export const GRUPA: InstructorGroup = {
  members: [
    {
      ...FILIP,
      progress: { courses_done: 5, courses_total: 5, hours_accepted: "72", supervision_present: 6, workshop_done: true },
    },
    {
      ...MARTA,
      progress: { courses_done: 2, courses_total: 5, hours_accepted: "12.5", supervision_present: 1, workshop_done: false },
    },
    {
      ...ZOFIA,
      progress: { courses_done: 0, courses_total: 5, hours_accepted: "0", supervision_present: 0, workshop_done: false },
    },
  ],
  slots: [TERMIN_ZAKONCZONY, TERMIN_PRZYSZLY],
};

export const GRUPA_PUSTA: InstructorGroup = { members: [], slots: [] };

/** Rzetelność w kolejności z serwera: od najniższego wyniku, brak wyniku na końcu. */
export const RZETELNOSC: OsobaRzetelnosci[] = [
  { ...ZOFIA, reliability_percent: "15", below_threshold: true },
  { ...MARTA, reliability_percent: "85.5", below_threshold: false },
  { ...FILIP, reliability_percent: null, below_threshold: false },
];
