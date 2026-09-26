import style from "./Skeleton.module.css";

interface WlasciwosciSkeleton {
  /** Ma mieć kształt treści, którą zastąpi — tyle samo wierszy. */
  wiersze: number;
}

/**
 * Szkielet `Skeleton` (A13). Kształt treści, którą zastąpi — ta sama liczba
 * wierszy, żeby po danych nie było przeskoku układu.
 */
export function Skeleton({ wiersze }: WlasciwosciSkeleton) {
  return (
    <div aria-busy="true" aria-live="polite">
      {Array.from({ length: wiersze }, (_, i) => (
        <div key={i} className={style.pasek} />
      ))}
    </div>
  );
}
