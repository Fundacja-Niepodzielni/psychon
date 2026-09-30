import type { MenuEntry } from "../types";
import { celTrasy } from "@/lib/przelaczenie/grupy";

/**
 * Wpis menu administracji: obsługa zgłoszeń dalszej współpracy (H01),
 * grupa przełączenia `wspolpraca` (`lib/przelaczenie/grupy.ts`). Ekran
 * administracji NIE MA starej trasy (funkcji dotąd w starym froncie nie
 * było) — dopóki grupa jest wyłączona, `celTrasy` zwraca `null` i ta lista
 * jest pusta: menu bazy nie rośnie o pozycję, która na bazie nie istniała.
 * Po włączeniu grupy lista niesie dokładnie jeden wpis z nową trasą
 * produktu.
 *
 * Eksport jest tablicą (0 albo 1 elementów), nie pojedynczym wpisem — inaczej
 * niż w plikach `hXX-nazwa.ts` bez grupy przełączenia — właśnie po to, żeby
 * `admin/index.ts` mógł go rozpłaszczyć (`...`) bez osobnej gałęzi `if`.
 */
const href = celTrasy("wspolpraca", "administracja");

const wpisy: MenuEntry[] = href === null
  ? []
  : [
      {
        label: "Zgłoszenia współpracy",
        href,
        order: 81,
        icon: "messages",
        section: "obsluga",
        roles: ["project_manager", "super_admin"],
      },
    ];

export default wpisy;
