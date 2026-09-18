import type { MenuEntry } from "../types";

/**
 * Kursy przypisane prowadzącemu (poz. 11, D-27) — edycja treści (dane kursu,
 * lekcje, materiały) tych samych punktów API co administracja, ograniczona
 * do kursów z własnym `CourseAssignment` (`GET /instructor/courses`, H09).
 *
 * `order` 12: między startem (10) i moją grupą (15) — kursy to główna treść
 * pracy prowadzącego, więc stoją zaraz po starcie.
 */
const entry: MenuEntry = {
  label: "Kursy",
  href: "/prowadzacy/kursy",
  order: 12,
  icon: "book",
};

export default entry;
