"use client";

import { useEffect, useState, type ReactNode } from "react";
import PanelShell from "@/components/layout/PanelShell";
import { participantMenu, participantMenuSections } from "@/lib/menu/participant";
import { filterMenuByRole } from "@/lib/menu/types";
import { api, ApiError } from "@/lib/api";
import type { Role } from "@/lib/home-by-role";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";

/**
 * Układ segmentu `/panel` w grupie tras `(przelaczenie)` — powłoka panelu
 * uczestnika (menu boczne, nagłówek, link skoku, jedyny `main` pod
 * `id="tresc"`) wokół ekranu nowego frontu. `DostawcaPowloki` mówi
 * szablonowi ekranu, że `main` niesie już powłoka, więc szablon renderuje
 * zwykły `div`.
 *
 * Menu jest filtrowane rolą z `/me` tak samo jak w starym układzie panelu:
 * wpisy dopuszczone tylko dla części ról (np. superwizja — wyłącznie
 * `volunteer`) są ukryte, dopóki `/me` nie odpowie (fail closed). Serwer
 * odmawia im i tak — to tylko chowa odnośnik.
 */
export default function UkladPanelu({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    api<{ role: Role }>("/me")
      .then((me) => {
        if (!cancelled) setRole(me.role);
      })
      .catch((err: unknown) => {
        // 401 czyści token i przekierowuje na /logowanie wewnątrz lib/api.ts.
        if (err instanceof ApiError && err.status === 401) return;
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PanelShell
      panelName="Panel uczestnika"
      menu={filterMenuByRole(participantMenu, role)}
      sections={participantMenuSections}
      menuKey="uczestnik"
    >
      <DostawcaPowloki>{children}</DostawcaPowloki>
    </PanelShell>
  );
}
