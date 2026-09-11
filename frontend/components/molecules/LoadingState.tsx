import Skeleton from "@/components/ui/Skeleton";

export interface LoadingStateProps {
  /** Zdanie dla czytnika ekranu; widoczny tekst zostaje ukryty (`sr-only`) —
   * Z-6 każe pokazywać szkielet treści, nie samo zdanie w środku ekranu. */
  label?: string;
  className?: string;
}

/**
 * `LoadingState` — molekuła C2 wariant C. Zastępuje 38 kopii `<p>Wczytywanie…</p>`
 * w 35 plikach; `role="status"` ma **każda** kopia (Z-6 próg: „0 stanów
 * ładowania bez `role='status'`"). Kształt treści renderuje atom `Skeleton`
 * (P2), który sam wyłącza puls pod `prefers-reduced-motion: reduce`
 * (`motion-reduce:animate-none`, F-91).
 */
export default function LoadingState({
  label = "Wczytywanie…",
  className = "",
}: LoadingStateProps) {
  return (
    <div role="status" aria-label={label} className={className}>
      <span className="sr-only">{label}</span>
      <Skeleton lines={3} />
    </div>
  );
}
