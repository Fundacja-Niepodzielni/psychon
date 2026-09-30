import type { MenuEntry } from "../types";
import { celTrasy } from "@/lib/przelaczenie/grupy";

/**
 * Wpis menu administracji: słownik form stażu (H11), grupa przełączenia
 * `formyStazu` (`lib/przelaczenie/grupy.ts`). Ekran NIE MA starej trasy
 * (słownika dotąd w starym froncie nie było) — dopóki grupa jest wyłączona,
 * `celTrasy` zwraca `null` i ta lista jest pusta: menu bazy nie rośnie o
 * pozycję, która na bazie nie istniała. Po włączeniu grupy lista niesie
 * dokładnie jeden wpis z nową trasą produktu.
 *
 * Eksport jest tablicą (0 albo 1 elementów), tak jak
 * `h01-zgloszenia-wspolpracy.ts` — `admin/index.ts` rozpłaszcza ją `...`.
 */
const href = celTrasy("formyStazu", "administracja");

const wpisy: MenuEntry[] = href === null
  ? []
  : [
      {
        label: "Formy stażu",
        href,
        order: 65,
        icon: "clipboard-list",
        section: "praktyka",
        roles: ["project_manager", "super_admin"],
      },
    ];

export default wpisy;
