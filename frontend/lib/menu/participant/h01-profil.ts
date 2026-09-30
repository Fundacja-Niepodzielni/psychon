import type { MenuEntry } from "../types";

/**
 * Wpis menu H01 dla `/panel/profil` (strona: `app/(uczestnik)/panel/profil/page.tsx`).
 * `GET/PATCH /me` w `backend/routes/api/h01.php` (`Route::get('/me'`,
 * `Route::patch('/me'`), bez `role:`, więc
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
