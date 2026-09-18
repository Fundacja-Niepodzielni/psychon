import type { MenuEntry } from "../types";

/**
 * Pakiet H21 — onboarding „Zacznij tutaj". Stała pozycja dla ról
 * uczestniczących. `GET /onboarding` (backend/routes/api/h21.php:24-25)
 * bez `role:` (rola `role:super_admin,project_manager` na h21.php:27
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
