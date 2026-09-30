"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import PanelShell from "@/components/layout/PanelShell";
import { adminMenu, adminMenuSections } from "@/lib/menu/admin";
import { czyTrasaWNowejRamce } from "@/lib/przelaczenie/ramka";
import { PowlokaAdministracji } from "./PowlokaAdministracji";

/**
 * Wybór ramki dla stron starej grupy tras administracji (`(administracja)/admin`).
 * Strona, która pod tym samym adresem zamienia treść na ekran nowego frontu
 * (grupa przełączenia włączona, stara trasa == nowa trasa), dostaje nową
 * ramkę z makiety; każda inna ścieżka — dotychczasowy `PanelShell` z tymi
 * samymi właściwościami co przed rejestrem. Przy wszystkich grupach
 * wyłączonych wynik jest zawsze `PanelShell` (bit w bit jak dotąd).
 */
export function RamkaAdministracji({ children }: { children: ReactNode }) {
  const sciezka = usePathname() ?? "";

  if (czyTrasaWNowejRamce(sciezka, "administracja")) {
    return <PowlokaAdministracji>{children}</PowlokaAdministracji>;
  }

  return (
    <PanelShell panelName="Administracja" menu={adminMenu} sections={adminMenuSections} menuKey="admin">
      {children}
    </PanelShell>
  );
}
