import type { MenuEntry } from "../types";
import { celTrasy } from "@/lib/przelaczenie/grupy";

/**
 * Wpis menu uczestnika: ekran po ukończeniu programu. Czyta `GET /me`
 * (backend/routes/api/h01.php:24-25) — grupa bez `role:`, więc dostępny
 * dla obu ról uczestniczących.
 *
 * `href` czyta cel z rejestru przełączenia (`lib/przelaczenie/grupy.ts`,
 * grupa `wspolpraca`) — dopóki grupa jest wyłączona, to dokładnie
 * `/panel/po-programie` jak dotąd; po włączeniu — nowa trasa produktu.
 * Ekran uczestnika ZAWSZE ma tu wpis (stara trasa istniała), więc `null`
 * (brak wpisu) tutaj nie występuje — stąd rzut na `string`, nie osłona.
 */
const href = celTrasy("wspolpraca", "uczestnik");
if (href === null) {
  throw new Error('grupa "wspolpraca": ekran uczestnika bez celu trasy — rejestr przełączenia jest niespójny');
}

const entry: MenuEntry = {
  label: "Po programie",
  href,
  order: 82,
  icon: "flag",
  section: "program",
  roles: ["volunteer", "student"],
};

export default entry;
