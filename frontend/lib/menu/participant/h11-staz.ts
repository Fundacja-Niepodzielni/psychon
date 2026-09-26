import type { MenuEntry } from "../types";

/**
 * Pakiet H11 — dziennik stażu wolontariusza. Staż przysługuje wyłącznie
 * wolontariuszom (backend/routes/api/h11.php — `role:volunteer` na
 * `/internship/entries`); inne role dostają 403 z API, więc wpis
 * pokazujemy tylko im.
 */
const entry: MenuEntry = {
  label: "Dziennik stażu",
  href: "/panel/staz",
  order: 30,
  icon: "clipboard-list",
  section: "program",
  roles: ["volunteer"],
};

export default entry;
