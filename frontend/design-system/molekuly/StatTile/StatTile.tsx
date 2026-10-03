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
  /** Kafel w rzędzie z wyrównaniem liczb (`StatRow` z `wyrownane`): ma zawsze najwyżej
   * trzy dzieci — podpis, liczbę i jeden blok pod nią (pasek i podpowiedź razem, gdy są oba),
   * żeby od 1180 px dało się go ułożyć na wspólnych wierszach rzędu (subgrid). Bez tej
   * właściwości struktura kafla jest taka jak dotąd (do czworga dzieci). */
  wyrownany?: boolean;
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
  wyrownany = false,
}: WlasciwosciStatTile) {
  const pasek = procent !== undefined ? <ProgressBar procent={procent} etykieta={mianownik} /> : null;
  const wskazowka = podpowiedz ? <Hint>{podpowiedz}</Hint> : null;
  return (
    <div
      className={style.kafel}
      data-dominujacy={dominujacy || undefined}
      data-wyrownany={wyrownany || undefined}
    >
      <Label htmlFor={id} dzieci={etykieta} />
      <div id={id} className={`${style.wartosc} ${dominujacy ? style.dominujacy : ""}`}>
        {wartosc === undefined ? (
          <span aria-label={`${etykieta}: brak danych`}>—</span>
        ) : (
          <Num wartosc={wartosc} etykieta={mianownik} />
        )}
      </div>
      {wyrownany && pasek && wskazowka ? (
        <div className={style.dodatek}>
          {pasek}
          {wskazowka}
        </div>
      ) : (
        <>
          {pasek}
          {wskazowka}
        </>
      )}
    </div>
  );
}
