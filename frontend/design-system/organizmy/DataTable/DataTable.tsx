import type { CSSProperties } from "react";
import { SearchBox } from "../../molekuly/SearchBox/SearchBox";
import { Pagination } from "../../molekuly/Pagination/Pagination";
import { Num } from "../../atomy/Num/Num";
import { Text } from "../../atomy/Text/Text";
import style from "./DataTable.module.css";

export interface KolumnaDataTable {
  klucz: string;
  etykieta: string;
  /** Gdy `true`, komórka renderuje `Num` (liczba zawsze z jednostką, KO-6)
   * zamiast surowego tekstu — `jednostka` wtedy obowiązkowa. */
  liczbowa?: boolean;
  jednostka?: string;
}

export interface WierszDataTable {
  id: string;
  /** Wartość per klucz kolumny — string dla tekstu, number dla `liczbowa`. */
  wartosci: Record<string, string | number>;
}

interface WlasciwosciSzukajkiDataTable {
  id: string;
  etykieta: string;
  wartosc: string;
  onZmiana: (wartosc: string) => void;
  placeholder?: string;
}

interface WlasciwosciStronicowaniaDataTable {
  strona: number;
  stron: number;
  naPoprzednia: () => void;
  naNastepna: () => void;
}

interface WlasciwosciDataTable {
  tytul: string;
  kolumny: KolumnaDataTable[];
  wiersze: WierszDataTable[];
  szukajka: WlasciwosciSzukajkiDataTable;
  stronicowanie?: WlasciwosciStronicowaniaDataTable;
  /** Komunikat, gdy `wiersze` jest puste (np. po odfiltrowaniu) — `Text`
   * wariant `pusty`, ta sama konwencja co stan `brakWynikow` w `SearchBox`. */
  komunikatPusty?: string;
}

/**
 * Tabela danych `DataTable` (O3). `SearchBox` (M2) nad danymi + `Pagination`
 * (M14) pod danymi + `Num` (A20) w komórkach liczbowych. Siatka wierszy jest
 * WŁASNYM układem `role="table"` (nie `<table>` HTML) właśnie po to, żeby
 * poniżej progu szerokości (`639px`, ta sama granica co `KeyValueRow` i
 * `Tabs`) CSS mógł zamienić wiersze w PARY/KARTY (`DataTable.module.css`)
 * zamiast wymuszać poziome przewijanie — nagłówek kolumny znika, a etykieta
 * każdej pary wraca przez `attr(data-etykieta)` w pseudoelemencie.
 */
export function DataTable({ tytul, kolumny, wiersze, szukajka, stronicowanie, komunikatPusty }: WlasciwosciDataTable) {
  return (
    <div className={style.tabela}>
      <SearchBox
        id={szukajka.id}
        etykieta={szukajka.etykieta}
        wartosc={szukajka.wartosc}
        onZmiana={szukajka.onZmiana}
        placeholder={szukajka.placeholder}
      />

      {wiersze.length === 0 ? (
        <Text wariant="pusty">{komunikatPusty ?? "Brak wyników. Zmień szukaną frazę."}</Text>
      ) : (
        <div
          className={style.siatka}
          role="table"
          aria-label={tytul}
          style={{ "--kolumny": kolumny.length } as CSSProperties}
        >
          <div className={style.wierszNaglowka} role="row">
            {kolumny.map((kolumna) => (
              <div key={kolumna.klucz} role="columnheader" className={style.komorka}>
                {kolumna.etykieta}
              </div>
            ))}
          </div>
          {wiersze.map((wiersz) => (
            <div key={wiersz.id} className={style.wiersz} role="row">
              {kolumny.map((kolumna) => (
                <div key={kolumna.klucz} role="cell" data-etykieta={kolumna.etykieta} className={style.komorka}>
                  {kolumna.liczbowa ? (
                    <Num wartosc={Number(wiersz.wartosci[kolumna.klucz])} etykieta={kolumna.jednostka ?? ""} />
                  ) : (
                    String(wiersz.wartosci[kolumna.klucz])
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {stronicowanie && (
        <Pagination
          strona={stronicowanie.strona}
          stron={stronicowanie.stron}
          naPoprzednia={stronicowanie.naPoprzednia}
          naNastepna={stronicowanie.naNastepna}
        />
      )}
    </div>
  );
}
