import { Fragment, type CSSProperties, type ReactNode } from "react";
import style from "./TabelaWierszy.module.css";

/** Rodzaj kolumny: z rodzaju wynika wygląd komórki i to, czy poniżej 640 px ma podpis. */
export type RodzajKolumnyTabeli = "nazwa" | "tekst" | "stan" | "akcje";

export interface KolumnaTabeli {
  /** Nagłówek od 640 px, podpis wartości poniżej 640 px (kolumna „akcje” ma go tylko dla czytnika). */
  nazwa: string;
  rodzaj: RodzajKolumnyTabeli;
}

export interface WierszTabeli {
  id: string;
  /** Jedna komórka na kolumnę, w kolejności kolumn; pierwsza jest nazwą wiersza. */
  komorki: ReactNode[];
  /** Panel otwarty pod wierszem (szczegóły); wiersz z panelem stoi na ciepłym tle. */
  panel?: ReactNode;
  /** Id elementu panelu — cel `aria-controls` przycisku, który go otwiera. */
  idPanelu?: string;
}

interface WlasciwosciTabeliWierszy {
  /** Nazwa tabeli dla czytnika ekranu. */
  tytul: string;
  kolumny: KolumnaTabeli[];
  wiersze: WierszTabeli[];
  /** Szerokości kolumn od 640 px (wartość `grid-template-columns`), po jednej na kolumnę. */
  siatka: string;
}

/**
 * Lista wierszy z nazwą jako odnośnikiem, na układzie tabeli od 640 px i na
 * bloku linii poniżej: nazwa pierwsza, pod nią wartości z podpisem kolumny,
 * akcje na końcu — bez przewijania poziomego. Semantyka tabeli to role ARIA na
 * elementach `div` (tak samo jak w liście rekordów systemu wzorów), więc ta
 * sama treść przechodzi z siatki w blok bez utraty powiązania wartości z nazwą
 * kolumny: wiersz nagłówków poniżej 640 px jest ukryty tylko wzrokowo.
 * Komponent niczego nie pobiera i nie zna ekranu — komórki dostaje gotowe.
 */
export function TabelaWierszy({ tytul, kolumny, wiersze, siatka }: WlasciwosciTabeliWierszy) {
  return (
    <div
      className={style.tabela}
      role="table"
      aria-label={tytul}
      data-liczba-kolumn={kolumny.length}
      style={{ "--siatka": siatka } as CSSProperties}
    >
      <div className={style.naglowki} role="row">
        {kolumny.map((kolumna) => (
          <span key={kolumna.nazwa} className={style.naglowekKolumny} role="columnheader">
            {kolumna.rodzaj === "akcje" ? <span className={style.ukryte}>{kolumna.nazwa}</span> : kolumna.nazwa}
          </span>
        ))}
      </div>
      {wiersze.map((wiersz) => {
        const otwarty = wiersz.panel !== undefined && wiersz.panel !== null;
        return (
          <Fragment key={wiersz.id}>
            <div
              className={otwarty ? `${style.wiersz} ${style.otwarty}` : style.wiersz}
              role="row"
              data-wiersz={wiersz.id}
            >
              {kolumny.map((kolumna, indeks) => (
                <div
                  key={kolumna.nazwa}
                  className={indeks === 0 ? `${style.komorka} ${style.nazwa}` : style.komorka}
                  role="cell"
                  data-rodzaj={kolumna.rodzaj}
                >
                  {indeks > 0 && kolumna.rodzaj !== "akcje" && (
                    <span className={style.podpis} aria-hidden="true">
                      {kolumna.nazwa}
                    </span>
                  )}
                  {wiersz.komorki[indeks]}
                </div>
              ))}
            </div>
            {otwarty && (
              <div className={style.wierszPanelu} role="row">
                <div className={style.panel} id={wiersz.idPanelu} role="cell" aria-colspan={kolumny.length}>
                  {wiersz.panel}
                </div>
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
