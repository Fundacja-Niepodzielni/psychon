import type { MenuEntry } from "../types";

/**
 * Wpis pakietu H14 (dokumenty generowane z profilu). `GET /documents`
 * (backend/routes/api/h14.php, `Route::get('/documents'`) bez `role:`, więc dostępny dla obu
 * ról uczestniczących.
 */
const entry: MenuEntry = {
  label: "Dokumenty",
  href: "/panel/dokumenty",
  order: 78,
  icon: "file-text",
  section: "konto",
  roles: ["volunteer", "student"],
};

export default entry;
