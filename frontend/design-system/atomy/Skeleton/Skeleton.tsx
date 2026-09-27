import style from "./Skeleton.module.css";

interface WlasciwosciSkeleton {
  /** Ma mieć kształt treści, którą zastąpi — tyle samo wierszy. Pomijane przy `wariant="przycisk"`. */
  wiersze?: number;
  /** `wiersze` (domyślny) = paski tekstu; `przycisk` = jeden pasek 34px, kształt przycisku który zastąpi. */
  wariant?: "wiersze" | "przycisk";
}

/**
 * Szkielet `Skeleton` (A13). Kształt treści, którą zastąpi — ta sama liczba
 * wierszy (albo, dla `wariant="przycisk"`, wysokość przycisku 34 px), żeby
 * po danych nie było przeskoku układu.
 */
export function Skeleton({ wiersze = 1, wariant = "wiersze" }: WlasciwosciSkeleton) {
  if (wariant === "przycisk") {
    return (
      <div aria-busy="true" aria-live="polite">
        <div className={style.przycisk} />
      </div>
    );
  }
  return (
    <div aria-busy="true" aria-live="polite">
      {Array.from({ length: wiersze }, (_, i) => (
        <div key={i} className={style.pasek} />
      ))}
    </div>
  );
}
