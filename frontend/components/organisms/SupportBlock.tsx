import { useId, type ReactNode } from "react";
import Card from "@/components/ui/Card";

export interface SupportBlockProps {
  title: string;
  description?: string;
  /** Akcja poboczna — waga `secondary`/`ghost`, nigdy `primary` (Z-13: tylko
   * `MainBlock` ma prawo do akcji głównej na ekranie). */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/**
 * `SupportBlock` (S3) — organizm C2 wariant C: blok wspierający, bez
 * własnego wyróżnienia tła — kontrastuje z `MainBlock`, żeby na ekranie
 * został dokładnie jeden blok główny (Z-2).
 */
export default function SupportBlock({
  title,
  description,
  action,
  children,
  className = "",
}: SupportBlockProps) {
  const titleId = useId();
  return (
    <Card className={className}>
      <h2 id={titleId} className="text-h4 font-bold text-ink">
        {title}
      </h2>
      {description && <p className="mt-2 text-body text-muted">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}
