"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import PanelShell from "@/components/layout/PanelShell";
import { instructorMenu, instructorMenuSections } from "@/lib/menu/instructor";
import { czyTrasaWNowejRamce } from "@/lib/przelaczenie/ramka";
import { PowlokaProwadzacego } from "./PowlokaProwadzacego";

/**
 * Wybór ramki dla stron starej grupy tras prowadzącego (`(prowadzacy)/prowadzacy`).
 * Strona, która pod tym samym adresem zamienia treść na ekran nowego frontu
 * (grupa przełączenia włączona, stara trasa == nowa trasa — dziś pulpit
 * `/prowadzacy`), dostaje nową ramkę z makiety; każda inna ścieżka —
 * dotychczasowy `PanelShell` z tymi samymi właściwościami co przed
 * rejestrem. Przy wszystkich grupach wyłączonych wynik jest zawsze `PanelShell`.
 */
export function RamkaProwadzacego({ children }: { children: ReactNode }) {
  const sciezka = usePathname() ?? "";

  if (czyTrasaWNowejRamce(sciezka, "prowadzacy")) {
    return <PowlokaProwadzacego>{children}</PowlokaProwadzacego>;
  }

  return (
    <PanelShell
      panelName="Panel prowadzącego"
      menu={instructorMenu}
      sections={instructorMenuSections}
      menuKey="prowadzacy"
    >
      {children}
    </PanelShell>
  );
}
