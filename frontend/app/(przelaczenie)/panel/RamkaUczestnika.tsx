"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import PanelShell from "@/components/layout/PanelShell";
import { api, ApiError } from "@/lib/api";
import type { Role } from "@/lib/home-by-role";
import { participantMenu, participantMenuSections } from "@/lib/menu/participant";
import { filterMenuByRole } from "@/lib/menu/types";
import { czyTrasaWNowejRamce } from "@/lib/przelaczenie/ramka";
import { PowlokaUczestnika } from "./PowlokaUczestnika";

/**
 * Wybór ramki dla stron starej grupy tras uczestnika (`(uczestnik)/panel`).
 * Strona, która pod tym samym adresem zamienia treść na ekran nowego frontu
 * (grupa przełączenia włączona, stara trasa == nowa trasa — dziś pulpit),
 * dostaje nową ramkę z makiety; każda inna ścieżka — dotychczasowy
 * `PanelShell` z tymi samymi właściwościami i tym samym filtrem roli co
 * przed rejestrem. Przy wszystkich grupach wyłączonych wynik jest zawsze
 * `PanelShell`.
 */
export function RamkaUczestnika({ children }: { children: ReactNode }) {
  const sciezka = usePathname() ?? "";

  if (czyTrasaWNowejRamce(sciezka, "uczestnik")) {
    return <PowlokaUczestnika>{children}</PowlokaUczestnika>;
  }

  return <DotychczasowaRamkaUczestnika>{children}</DotychczasowaRamkaUczestnika>;
}

/** Dotychczasowy układ panelu uczestnika bez zmian: menu filtrowane rolą z `/me`. */
function DotychczasowaRamkaUczestnika({ children }: { children: ReactNode }) {
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
    <PanelShell
      panelName="Panel uczestnika"
      menu={filterMenuByRole(participantMenu, role)}
      sections={participantMenuSections}
      menuKey="uczestnik"
    >
      {children}
    </PanelShell>
  );
}
