import type { MenuEntry } from "../types";

/**
 * Pakiet H12 — terminy superwizji uczestniczki. Superwizja przysługuje
 * wyłącznie wolontariuszom (backend/routes/api/h12.php —
 * `role:volunteer` na `/supervision/slots`); inne role dostają 403 z API,
 * więc wpis pokazujemy tylko im.
 */
const entry: MenuEntry = {
  // Nazwa ze słownika interfejsu (B7 wiersz 6) i zarazem nagłówek ekranu
  // `/panel/superwizja`, żeby pozycja menu potwierdzała, gdzie się trafiło.
  label: "Superwizja",
  href: "/panel/superwizja",
  order: 35,
  icon: "messages",
  section: "program",
  roles: ["volunteer"],
};

export default entry;
