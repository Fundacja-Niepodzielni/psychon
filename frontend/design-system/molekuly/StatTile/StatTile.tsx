import { Label } from "../../atomy/Label/Label";
import { Num } from "../../atomy/Num/Num";
import { ProgressBar } from "../../atomy/ProgressBar/ProgressBar";
import { Hint } from "../../atomy/Hint/Hint";
import style from "./StatTile.module.css";

interface WlasciwosciStatTile {
  id: string;
  etykieta: string;
  /** Brak — kafel bez danych pokazuje „—” zamiast liczby, nigdy 0 domyślne. */
  wartosc?: number;
  /** Jednostka albo mianownik (KO-6) — obowiązkowy razem z `wartosc`. */
  mianownik: string;
  /** Gdy podane, kafel dostaje `ProgressBar` — co najwyżej jeden dominujący na ekran. */
  procent?: number;
  podpowiedz?: string;
  /** Dokładnie jeden na pasek (Odbiór M10) — 44px/900, reszta 24px/700. */
  dominujacy?: boolean;
}

/**
 * Kafel liczby `StatTile` (M10). Bez ramki, tła i cienia — to nie karta.
 * Wartość zawsze z jednostką albo mianownikiem; brak danych renderuje „—”,
 * nie zero.
 */
export function StatTile({
  id,
  etykieta,
  wartosc,
  mianownik,
  procent,
  podpowiedz,
  dominujacy = false,
}: WlasciwosciStatTile) {
  return (
    <div className={style.kafel} data-dominujacy={dominujacy || undefined}>
      <Label htmlFor={id} dzieci={etykieta} />
      <div id={id} className={`${style.wartosc} ${dominujacy ? style.dominujacy : ""}`}>
        {wartosc === undefined ? (
          <span aria-label={`${etykieta}: brak danych`}>—</span>
        ) : (
          <Num wartosc={wartosc} etykieta={mianownik} />
        )}
      </div>
      {procent !== undefined && <ProgressBar procent={procent} etykieta={mianownik} />}
      {podpowiedz && <Hint>{podpowiedz}</Hint>}
    </div>
  );
}
