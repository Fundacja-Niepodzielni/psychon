"use client";

import type { ReactNode } from "react";
import Link from "next/link";

export interface QueueRowProps {
  /** Tytuł pozycji kolejki (pogrubiony). */
  title: string;
  /** Zdanie kontekstu pod tytułem (opcjonalne). */
  description?: string;
  /** Plakietka statusu albo inna dana obok tytułu (np. `Badge`). */
  meta?: ReactNode;
  /** Cały wiersz jest odnośnikiem, gdy podane. */
  href?: string;
  /** Cały wiersz jest przyciskiem, gdy podane (zamiast `href`). */
  onClick?: () => void;
  /** Wiersz bez akcji — pozycja już obsłużona; bez `href`/`onClick`,
   * wyciszony wizualnie (Z-6/Z-10: to nie jest błąd, tylko brak akcji). */
  disabled?: boolean;
  className?: string;
}

const wiersz =
  "flex min-h-11 w-full items-center justify-between gap-4 rounded-md border border-line bg-card px-4 py-3 text-left transition-colors duration-200 focus-visible:focus-ring";

/**
 * `QueueRow` — molekuła C2 wariant C (partia P3a): wiersz kolejki, cały
 * klikalny, dokładnie jedna akcja (Z-10, Z-13). Zastępuje 9 niezależnych
 * implementacji stronicowania obok wierszy kolejek pisanych ręcznie w
 * ekranach `h07`, `h11`, `h18`, `h20` (nie ruszanych w P3a).
 */
export default function QueueRow({
  title,
  description,
  meta,
  href,
  onClick,
  disabled = false,
  className = "",
}: QueueRowProps) {
  const tresc = (
    <>
      <span className="flex flex-col gap-0.5">
        <span className="text-body font-medium text-ink">{title}</span>
        {description && (
          <span className="text-small text-muted">{description}</span>
        )}
      </span>
      {meta && <span className="shrink-0">{meta}</span>}
    </>
  );

  if (disabled || (!href && !onClick)) {
    return (
      <div
        className={`${wiersz} cursor-default opacity-60 ${className}`}
        aria-disabled="true"
      >
        {tresc}
      </div>
    );
  }

  if (href) {
    return (
      <Link href={href} className={`${wiersz} hover:bg-grey ${className}`}>
        {tresc}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${wiersz} hover:bg-grey ${className}`}
    >
      {tresc}
    </button>
  );
}
