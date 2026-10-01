"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";
import type { GrupaMenuOkruszka } from "./OkruszekRamki";

/**
 * Kontekst nowej ramki panelu (szablon `PowlokaPanelu`, ramka z makiety
 * 2.0.4). Znaczy „ekran stoi w nowej ramce” — w odróżnieniu od
 * `DostawcaPowloki` (`KontekstPowloki.tsx`), który znaczy „`main` niesie już
 * powłoka” i stoi także w dotychczasowym `PanelShell`.
 *
 * Wstawia go tylko `PowlokaPanelu`, razem z menu ramki i bieżącą ścieżką.
 * Nagłówek ekranu (`PageHeader`) w nowej ramce nie ma przycisku „Wstecz”, a
 * okruszek składa regułą z `OkruszekRamki.ts` z tego menu i tej ścieżki; poza
 * ramką (stara powłoka, poligon) — zachowanie jak dotąd.
 */
interface DaneRamki {
  menu: GrupaMenuOkruszka[];
  sciezka: string;
}

const KontekstRamki = createContext<DaneRamki | null>(null);

const BRAK_MENU: GrupaMenuOkruszka[] = [];

/**
 * Dostawca: wszystko wewnątrz stoi w nowej ramce panelu. `menu` to grupy
 * menu ramki (z oznaczoną pozycją bieżącą); bez niego okruszek nie zna
 * pozycji menu ani korzenia roli i składa się wyłącznie z okruszków ekranu.
 */
export function DostawcaRamki({ menu = BRAK_MENU, children }: { menu?: GrupaMenuOkruszka[]; children: ReactNode }) {
  const sciezka = usePathname() ?? "";
  return <KontekstRamki.Provider value={{ menu, sciezka }}>{children}</KontekstRamki.Provider>;
}

/** Hak: prawda, gdy ekran stoi w nowej ramce panelu. */
export function useWRamce(): boolean {
  return useContext(KontekstRamki) !== null;
}

/** Hak: menu i ścieżka nowej ramki; `null` poza nią. */
export function useDaneRamki(): DaneRamki | null {
  return useContext(KontekstRamki);
}
