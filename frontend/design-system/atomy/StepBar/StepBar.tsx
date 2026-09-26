import style from "./StepBar.module.css";

interface WlasciwosciStepBar {
  zrobione: number;
  razem: number;
  /** np. "lekcji ukończonych" — składa się z liczbami w nazwę dostępną. */
  jednostka: string;
}

/**
 * Pasek kroków `StepBar` (A17). Krok bieżący różni się podziałem pola
 * (gradient pół na pół), nie samą barwą. Nazwa dostępna niesie liczby.
 */
export function StepBar({ zrobione, razem, jednostka }: WlasciwosciStepBar) {
  const kroki = Array.from({ length: razem }, (_, i) => i);
  return (
    <div
      role="img"
      aria-label={`${zrobione} z ${razem} ${jednostka}`}
      className={style.pasek}
    >
      {kroki.map((i) => (
        <span
          key={i}
          className={`${style.krok} ${
            i < zrobione ? style.zrobiony : i === zrobione ? style.biezacy : ""
          }`}
        />
      ))}
    </div>
  );
}
