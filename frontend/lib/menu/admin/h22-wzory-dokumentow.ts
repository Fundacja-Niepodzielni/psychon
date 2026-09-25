import type { MenuEntry } from "../types";

/**
 * Wzory dokumentów — treść porozumienia, zaświadczenia i certyfikatu z
 * historią wersji. Kontrakt backendu ogranicza zapis i odczyt do
 * `project_manager`/`super_admin` (`role:project_manager,super_admin`) —
 * `roles` chowa link tam, gdzie odpowiedź byłaby `403`, tak jak przy
 * pozostałych wpisach z ograniczeniem roli.
 */
const entry: MenuEntry = {
  label: "Wzory dokumentów",
  href: "/admin/wzory-dokumentow",
  order: 140,
  icon: "file-text",
  section: "konfiguracja",
  roles: ["project_manager", "super_admin"],
};

export default entry;
