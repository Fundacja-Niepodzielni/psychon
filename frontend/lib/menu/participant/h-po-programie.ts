import type { MenuEntry } from "../types";

/**
 * Wpis menu uczestnika: ekran po ukończeniu programu. Czyta `GET /me`
 * (backend/routes/api/h01.php, `Route::middleware('auth:keycloak')->group(`) — grupa bez `role:`, więc dostępny
 * dla obu ról uczestniczących.
 */
const entry: MenuEntry = {
  label: "Po programie",
  href: "/panel/po-programie",
  order: 82,
  icon: "flag",
  section: "program",
  roles: ["volunteer", "student"],
};

export default entry;
