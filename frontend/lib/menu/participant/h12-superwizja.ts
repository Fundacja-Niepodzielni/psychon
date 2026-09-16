import type { MenuEntry } from "../types";

/**
 * Pakiet H12 — terminy superwizji uczestniczki. Superwizja przysługuje
 * wyłącznie wolontariuszom (backend/routes/api/h12.php:25 —
 * `role:volunteer` na `/supervision/slots`); inne role dostają 403 z API,
 * więc wpis pokazujemy tylko im.
 */
const entry: MenuEntry = {
  label: "Superwizje",
  href: "/panel/superwizja",
  order: 35,
  roles: ["volunteer"],
};

export default entry;
