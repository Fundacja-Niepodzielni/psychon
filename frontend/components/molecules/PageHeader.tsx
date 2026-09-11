import type { ReactNode } from "react";

export interface PageHeaderProps {
  /** `h1` ekranu — ta sama nazwa co pozycja menu, która tu prowadzi (Z-8). */
  title: string;
  /** Zdanie kontekstu pod nagłówkiem (opcjonalne). */
  description?: string;
  /** Najwyżej jedna akcja główna (Z-13); kolejne przyciski wchodzą tu jako
   * rodzeństwo, ale odpowiedzialność za „tylko jedna główna" zostaje po
   * stronie wywołującego ekranu. */
  action?: ReactNode;
  className?: string;
}

/**
 * `PageHeader` — molekuła C2 wariant C (część 3): `h1` + zdanie kontekstu +
 * najwyżej jedna akcja główna. Zastępuje 24 osobne kopie nagłówka pisane
 * bezpośrednio w `app/**\/page.tsx` (KC-1).
 */
export default function PageHeader({
  title,
  description,
  action,
  className = "",
}: PageHeaderProps) {
  return (
    <div
      className={`flex flex-wrap items-end justify-between gap-4 ${className}`}
    >
      <div>
        <h1 className="text-h2 font-black text-ink">{title}</h1>
        {description && (
          <p className="mt-1 text-body text-muted">{description}</p>
        )}
      </div>
      {action && <div className="flex flex-wrap gap-3">{action}</div>}
    </div>
  );
}
