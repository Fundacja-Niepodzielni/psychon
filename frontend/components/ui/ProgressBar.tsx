export interface ProgressBarProps {
  /** Wartość 0–100. */
  value: number;
  /** Etykieta dla czytników ekranu, np. "Postęp kursu". */
  label: string;
  /** Pokazuje wartość procentową obok paska. */
  showValue?: boolean;
  className?: string;
}

export default function ProgressBar({
  value,
  label,
  showValue = false,
  className = "",
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2.5 flex-1 overflow-hidden rounded-pill bg-grey-mid"
      >
        <div
          className="h-full rounded-pill bg-brand transition-[width] duration-300"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showValue && (
        <span className="min-w-10 text-right text-caption font-bold text-ink">
          {clamped}%
        </span>
      )}
    </div>
  );
}
