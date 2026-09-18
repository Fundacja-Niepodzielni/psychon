import type { MenuEntry } from "../types";

/**
 * Pakiet H15 — wniosek o wpis do bazy psychologów Fundacji. Wniosek
 * przysługuje wyłącznie wolontariuszom (backend/routes/api/h15.php:25 —
 * `role:volunteer` na `/psychologist-profile`); inne role dostają 403
 * z API, więc wpis pokazujemy tylko im.
 */
const entry: MenuEntry = {
  label: "Profil psychologa",
  href: "/panel/profil-psychologa",
  order: 85,
  icon: "badge-check",
  section: "konto",
  roles: ["volunteer"],
};

export default entry;
