import { useId, type ReactNode } from "react";

export interface MainBlockProps {
  title: string;
  description?: string;
  /** Jedyna akcja główna sekcji (Z-13) — zwykle `<Button variant="primary">`. */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/**
 * `MainBlock` (S2) — organizm C2 wariant C: jedyny wyróżniony blok pulpitu
 * (Z-2 — rozstrzyga własne tło/akcent, nie stopień nagłówka) z najwyżej
 * jedną akcją główną (Z-13). Tło `bg-accent-06` / obramowanie
 * `border-accent-15` — ten sam token, który C1 wskazuje jako wzorzec
 * wyróżnienia bloku głównego.
 */
export default function MainBlock({
  title,
  description,
  action,
  children,
  className = "",
}: MainBlockProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={`rounded-lg border border-accent-15 bg-accent-06 p-6 ${className}`}
    >
      <h2 id={titleId} className="text-h3 font-black text-ink">
        {title}
      </h2>
      {description && <p className="mt-2 text-body text-muted">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </section>
  );
}
