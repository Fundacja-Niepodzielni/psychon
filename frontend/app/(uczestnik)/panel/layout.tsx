"use client";

import { useEffect, useState } from "react";
import PanelShell from "@/components/layout/PanelShell";
import { participantMenu } from "@/lib/menu/participant";
import { filterMenuByRole } from "@/lib/menu/types";
import { api, ApiError } from "@/lib/api";
import type { Role } from "@/lib/home-by-role";

export default function ParticipantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [role, setRole] = useState<Role | undefined>(undefined);

  /**
   * Rejestr menu ma wpisy dopuszczone tylko dla części ról panelu (np.
   * superwizja — wyłącznie `volunteer`, patrz `h12-superwizja.ts`). API
   * odmawia im i tak (`role:volunteer` po stronie serwera) — to tylko
   * chowa link, żeby zamiast 403 w ogóle się nie pojawił. Dopóki `/me`
   * nie odpowie, `filterMenuByRole` chowa takie wpisy (fail closed),
   * zamiast pokazać je na chwilę każdej roli.
   */
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
    <PanelShell panelName="Panel uczestnika" menu={filterMenuByRole(participantMenu, role)}>
      {children}
    </PanelShell>
  );
}
