import style from "./ProgressBar.module.css";

interface WlasciwosciProgressBar {
  procent: number;
  /** Liczba z jednostką albo mianownikiem — pasek nigdy nie jest jedynym nośnikiem (KO-6). */
  etykieta: string;
  wariant?: "kafel" | "odtwarzacz";
}

/**
 * Pasek postępu `ProgressBar` (A16). Tor widoczny nawet przy 0%. Obok zawsze
 * stoi wartość z jednostką albo mianownikiem — atom odmawia pracy bez niej.
 */
export function ProgressBar({ procent, etykieta, wariant = "kafel" }: WlasciwosciProgressBar) {
  if (etykieta.trim() === "") {
    throw new Error("ProgressBar: pasek bez wartości z jednostką nie jest dozwolony");
  }
  const bezpiecznyProcent = Math.min(100, Math.max(0, procent));
  return (
    <div className={style.oprawa}>
      <div
        role="progressbar"
        aria-valuenow={bezpiecznyProcent}
        aria-valuemin={0}
        aria-valuemax={100}
        className={style.tor}
      >
        <div
          className={`${style.wypelnienie} ${wariant === "odtwarzacz" ? style.wypelnienieOdtwarzacz : ""}`}
          style={{ width: `${bezpiecznyProcent}%` }}
        />
      </div>
      <span>{etykieta}</span>
    </div>
  );
}
