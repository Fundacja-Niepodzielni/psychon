import type { ReactNode } from "react";

export interface StatTileProps {
  value: string | number;
  label: string;
  /** „dominująca" = jedna liczba na kontener, wyraźnie większa (Z-3, Z-16);
   * „zwykła" = pozostałe kafle grupy. Domyślnie „zwykła". */
  variant?: "dominant" | "regular";
  /** Kontekst liczby dominującej — porównanie, kierunek zmiany albo następna
   * akcja (Z-3: „liczba dominująca zawsze niesie kontekst"). Pomijany dla
   * wariantu „zwykła". */
  context?: ReactNode;
  className?: string;
}

/**
 * `StatTile` — molekuła C2 wariant C: jedna liczba + etykieta. Zastępuje
 * dwie niezależne implementacje kafla liczby (`admin/page.tsx`,
 * `PulpitDashboard.tsx`). Stopień pisma niesie ważność — `text-h1` dla
 * wariantu dominującego (42 px), `text-h3` dla zwykłego (26 px): różnica
 * 16 px, powyżej progu Z-3 (≥ 6 px).
 */
export default function StatTile({
  value,
  label,
  variant = "regular",
  context,
  className = "",
}: StatTileProps) {
  const dominant = variant === "dominant";
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span
        className={`${dominant ? "text-h1" : "text-h3"} font-black text-ink`}
      >
        {value}
      </span>
      <span className="text-caption font-bold uppercase tracking-wide text-subtle">
        {label}
      </span>
      {dominant && context && (
        <span className="text-small text-muted">{context}</span>
      )}
    </div>
  );
}
