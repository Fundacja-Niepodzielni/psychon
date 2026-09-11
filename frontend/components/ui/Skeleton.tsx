export interface SkeletonProps {
  /** Liczba pasków szkieletu (domyślnie 3, jak dawny szkielet `LoadingState`). */
  lines?: number;
  className?: string;
}

/**
 * `Skeleton` — atom C2 wariant C: szkielet treści zamiast zdania
 * „Wczytywanie…” na środku ekranu (Z-6). Same paski są `aria-hidden` — status
 * dla czytnika ekranu ogłasza kontener nadrzędny (`role="status"` w
 * `LoadingState`), nie ten atom. `motion-reduce:animate-none` wyłącza puls,
 * gdy osoba ma włączone „ograniczone animacje” w systemie (Z-4, F-91).
 */
export default function Skeleton({ lines = 3, className = "" }: SkeletonProps) {
  return (
    <div aria-hidden="true" className={`flex flex-col gap-3 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`h-10 animate-pulse rounded-sm bg-grey motion-reduce:animate-none ${
            i === lines - 1 ? "w-3/4" : "w-full"
          }`}
        />
      ))}
    </div>
  );
}
