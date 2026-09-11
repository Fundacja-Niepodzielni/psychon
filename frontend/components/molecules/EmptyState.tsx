import type { ReactNode } from "react";
import Card from "@/components/ui/Card";

export interface EmptyStateProps {
  title: string;
  /** Zdanie „co teraz zrobić" (Z-6). */
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * `EmptyState` — molekuła C2 wariant C. Zastępuje 39 fraz „Brak …" pisanych
 * osobno na każdym ekranie.
 */
export default function EmptyState({
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <Card className={`text-center ${className}`}>
      <h2 className="text-h4 font-bold text-ink">{title}</h2>
      {description && (
        <p className="mt-2 text-body text-muted">{description}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </Card>
  );
}
