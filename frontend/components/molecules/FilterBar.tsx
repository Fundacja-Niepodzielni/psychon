import type { ReactNode } from "react";

export interface FilterBarProps {
  /** Kontrolki filtrów (np. `Select`, `Input`) — każda pilnuje własnego
   * błędu i etykiety (`Field`); `FilterBar` tylko układa je w rzędzie. */
  children: ReactNode;
  /** Opcjonalne zdanie nad rzędem filtrów. */
  label?: string;
  className?: string;
}

/**
 * `FilterBar` — molekuła C2 wariant C: filtry w jednym rzędzie, zawijane na
 * wąskim ekranie (`flex-wrap`, Z-14 — nic na ścieżce krytycznej nie jest
 * domyślnie schowane, więc filtry nie chowają się za „Pokaż więcej").
 */
export default function FilterBar({ children, label, className = "" }: FilterBarProps) {
  return (
    <div
      role="group"
      aria-label={label ?? "Filtry"}
      className={`flex flex-wrap items-end gap-3 ${className}`}
    >
      {children}
    </div>
  );
}
