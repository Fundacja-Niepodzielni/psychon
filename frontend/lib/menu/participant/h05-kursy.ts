import type { MenuEntry } from "../types";

/**
 * Wpis pakietu H05 — katalog kursów uczestnika. `GET /courses`
 * (backend/routes/api/h05.php:22-23) bez `role:`, więc dostępny dla obu
 * ról uczestniczących.
 */
const entry: MenuEntry = {
  label: "Kursy",
  href: "/panel/kursy",
  order: 20,
  icon: "book",
  section: "program",
  roles: ["volunteer", "student"],
};

export default entry;
