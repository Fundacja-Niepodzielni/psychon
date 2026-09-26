import type { MenuEntry } from "../types";

/**
 * Pakiet H21 — onboarding „Zacznij tutaj". Stała pozycja dla ról
 * uczestniczących. `GET /onboarding` (backend/routes/api/h21.php,
 * `Route::get('/onboarding'`) bez `role:` (rola
 * `role:super_admin,project_manager` w h21.php
 * dotyczy tylko `PATCH /admin/onboarding`).
 */
const entry: MenuEntry = {
  label: "Start",
  href: "/panel/start",
  order: 10,
  icon: "rocket",
  roles: ["volunteer", "student"],
};

export default entry;
