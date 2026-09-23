import type { MenuEntry } from "../types";

/**
 * Placeholder pakietu H01 (profil uczestnika) — strona powstanie w pakiecie.
 * `GET/PATCH /me` (backend/routes/api/h01.php:24-26) bez `role:`, więc
 * dostępny dla obu ról uczestniczących.
 */
const entry: MenuEntry = {
  label: "Profil",
  href: "/panel/profil",
  order: 90,
  icon: "user",
  section: "konto",
  roles: ["volunteer", "student"],
};

export default entry;
