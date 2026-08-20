import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Nagłówek karty (opcjonalny). */
  title?: string;
  /** Ciepłe tło (--psy-bg-card-warm) zamiast białego. */
  warm?: boolean;
  children: ReactNode;
}

export default function Card({
  title,
  warm = false,
  className = "",
  children,
  ...rest
}: CardProps) {
  return (
    <section
      className={`rounded-lg border border-line p-6 shadow-card ${
        warm ? "bg-card-warm" : "bg-card"
      } ${className}`}
      {...rest}
    >
      {title && <h2 className="mb-4 text-h4 font-bold text-ink">{title}</h2>}
      {children}
    </section>
  );
}
