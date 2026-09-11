export interface LoadingStateProps {
  /** Zdanie dla czytnika ekranu; widoczny tekst zostaje ukryty (`sr-only`) —
   * Z-6 każe pokazywać szkielet treści, nie samo zdanie na środku ekranu. */
  label?: string;
  className?: string;
}

/**
 * `LoadingState` — molekuła C2 wariant C. Zastępuje 38 kopii `<p>Wczytywanie…</p>`
 * w 35 plikach; `role="status"` ma **każda** kopia (Z-6 próg: „0 stanów
 * ładowania bez `role='status'`"). Atom `Skeleton` z inwentarza (część 3) nie
 * wchodzi w zakres partii P1 — kształt treści tu jest uproszczony do pasków.
 */
export default function LoadingState({
  label = "Wczytywanie…",
  className = "",
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={`flex flex-col gap-3 ${className}`}
    >
      <span className="sr-only">{label}</span>
      <div
        aria-hidden="true"
        className="h-10 w-full animate-pulse rounded-sm bg-grey"
      />
      <div
        aria-hidden="true"
        className="h-10 w-full animate-pulse rounded-sm bg-grey"
      />
      <div
        aria-hidden="true"
        className="h-10 w-3/4 animate-pulse rounded-sm bg-grey"
      />
    </div>
  );
}
