import type { ReactNode } from "react";

export interface InsetProps {
  /** `li` — gdy blok jest wierszem listy. */
  as?: "div" | "li";
  /** `row` — treść i akcje w jednym wierszu, zawijane na telefonie. */
  layout?: "stack" | "row";
  /** Ciepłe tło zamiast tła strony. */
  warm?: boolean;
  /** Nagłówek bloku (`h3`), gdy blok jest osobną częścią karty. */
  title?: string;
  className?: string;
  children: ReactNode;
}

const layouts = {
  stack: "flex flex-col gap-4 p-4",
  row: "flex flex-wrap items-center justify-between gap-3 px-4 py-2",
} as const;

/**
 * `Inset` — obramowany blok wewnątrz karty (wiersz do przestawienia,
 * formularz edycji, pytanie). Bez cienia: cień mają tylko karty (Z-4).
 */
export default function Inset({
  as: Tag = "div",
  layout = "stack",
  warm = false,
  title,
  className = "",
  children,
}: InsetProps) {
  return (
    <Tag
      className={`rounded-control border border-line ${
        warm ? "bg-card-warm" : "bg-page"
      } ${layouts[layout]} ${className}`}
    >
      {title && <h3 className="text-body font-bold text-heading">{title}</h3>}
      {children}
    </Tag>
  );
}
