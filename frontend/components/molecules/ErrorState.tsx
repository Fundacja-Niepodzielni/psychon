import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";

export interface ErrorStateProps {
  message: string;
  title?: string;
  /** Brak `onRetry` = brak przycisku (np. błąd bez sensownego ponowienia). */
  onRetry?: () => void;
  className?: string;
}

/**
 * `ErrorState` — molekuła C2 wariant C: `Alert` + przycisk „Spróbuj ponownie"
 * (Z-6: „3/3 stany niepomyślne mają akcję").
 */
export default function ErrorState({
  message,
  title = "Nie udało się wczytać danych",
  onRetry,
  className = "",
}: ErrorStateProps) {
  return (
    <div className={`flex flex-col items-start gap-3 ${className}`}>
      <Alert variant="error" title={title}>
        {message}
      </Alert>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Spróbuj ponownie
        </Button>
      )}
    </div>
  );
}
