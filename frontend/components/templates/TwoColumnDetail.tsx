import type { ReactNode } from "react";

export interface TwoColumnDetailProps {
  /** Kolumna główna — treść rekordu (dane, listy edytowalne). */
  main: ReactNode;
  /** Kolumna boczna — metadane i akcje poboczne (stan, przypisania, powiązania). */
  sidebar: ReactNode;
  /**
   * Szerokość kolumny bocznej w px. Domyślnie `--psy-sidebar-width` (260px)
   * — ta sama wartość co szerokość nawigacji bocznej (Z-8), żeby ekran nie
   * wprowadzał nowej skali obok istniejącej.
   */
  sidebarWidth?: number;
}

/**
 * `TwoColumnDetail` — układ ekranu szczegółu rekordu (U-1): kolumna główna
 * + wąska kolumna boczna od 1280 px (`xl`), jedna kolumna w pionie poniżej
 * tego progu. Do użycia na każdym ekranie „jeden rekord + panele boczne”
 * (dziś: `admin/kursy/[id]`), nie tylko tutaj.
 */
export default function TwoColumnDetail({
  main,
  sidebar,
  sidebarWidth = 260,
}: TwoColumnDetailProps) {
  return (
    <div
      className="flex flex-col gap-stack xl:grid xl:items-start xl:gap-stack"
      style={{ gridTemplateColumns: `minmax(0, 1fr) ${sidebarWidth}px` }}
    >
      <div className="flex min-w-0 flex-col gap-stack">{main}</div>
      <div className="flex min-w-0 flex-col gap-stack">{sidebar}</div>
    </div>
  );
}
