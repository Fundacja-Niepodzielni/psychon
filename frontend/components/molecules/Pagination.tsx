"use client";

import Button from "@/components/ui/Button";

export interface PaginationProps {
  strona: number;
  ostatniaStrona: number;
  onZmien: (strona: number) => void;
  className?: string;
}

/**
 * `Pagination` — molekuła C2 wariant C: „Poprzednia / Strona X z Y /
 * Następna". Pola dotyku ≥ 44 px (`min-h-11`, Z-10). Ta sama treść, co blok
 * już wpięty w `components/templates/ListTemplate.tsx` — tamten plik dziś
 * ma własną, równoległą implementację; przejście na tę molekułę to osobna
 * zmiana.
 */
export default function Pagination({
  strona,
  ostatniaStrona,
  onZmien,
  className = "",
}: PaginationProps) {
  return (
    <nav
      aria-label="Stronicowanie"
      className={`flex items-center justify-center gap-3 ${className}`}
    >
      <Button
        variant="secondary"
        className="min-h-11"
        disabled={strona <= 1}
        onClick={() => onZmien(Math.max(1, strona - 1))}
      >
        Poprzednia
      </Button>
      <span className="text-small text-subtle" aria-live="polite">
        Strona {strona} z {ostatniaStrona}
      </span>
      <Button
        variant="secondary"
        className="min-h-11"
        disabled={strona >= ostatniaStrona}
        onClick={() => onZmien(Math.min(ostatniaStrona, strona + 1))}
      >
        Następna
      </Button>
    </nav>
  );
}
