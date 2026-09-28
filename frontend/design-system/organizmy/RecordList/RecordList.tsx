import { ListRow } from "../../molekuly/ListRow/ListRow";
import { EmptyState } from "../../molekuly/EmptyState/EmptyState";
import { Heading } from "../../atomy/Heading/Heading";
import { Num } from "../../atomy/Num/Num";
import style from "./RecordList.module.css";

type WariantPlakietkiRecordList = "neutral" | "ok" | "warn" | "error" | "pending";

interface PlakietkaRecordList {
  wariant: WariantPlakietkiRecordList;
  tekst: string;
}

interface AkcjaRecordList {
  etykieta: string;
  href?: string;
  onKliknij?: () => void;
}

export interface WierszRecordList {
  id: string;
  tytul: string;
  podpowiedz?: string;
  plakietka?: PlakietkaRecordList;
  /** Wielkość wiersza („data, wielkość, stan, źródło”) —
   * wchodzi jednocześnie do licznika `ListRow` i do sumy w stopce, jedno
   * źródło prawdy, bez osobnego pola tylko do wyświetlenia. */
  wartosc: number;
  akcja: AkcjaRecordList;
}

interface WlasciwosciPustyRecordList {
  naglowek: string;
  tresc: string;
  przycisk: { etykieta: string; onClick: () => void };
}

interface WlasciwosciRecordList {
  tytul: string;
  wiersze: WierszRecordList[];
  /** Jednostka/mianownik sumy w stopce (KO-6, jak `Num`/`StatTile`). */
  jednostkaSumy: string;
  /** Renderowane zamiast listy i stopki, gdy `wiersze` jest puste
   * („EmptyState gdy zero wierszy”). */
  pusty: WlasciwosciPustyRecordList;
}

/**
 * Lista rekordów `RecordList` (O4). `ListRow` (M3) na wiersz + suma w
 * STOPCE liczona z `wiersze` (jedno źródło prawdy — nigdy osobny licznik
 * mogący się rozjechać z listą) + `EmptyState` (M17), gdy `wiersze` jest
 * puste. Składa 5 sekcji ekranu T3 „źródła liczb osoby”
 * (KARTA-EKRANU-T3-ZRODLA-LICZB-OSOBY): sam nie sprawdza rozjazdu sumy z
 * liczbą karty osoby — to porównanie i `Notice` żyją na poziomie strony,
 * która montuje po jednym `RecordList` na sekcję.
 */
export function RecordList({ tytul, wiersze, jednostkaSumy, pusty }: WlasciwosciRecordList) {
  if (wiersze.length === 0) {
    return (
      <section className={style.sekcja} aria-label={tytul}>
        <Heading stopien={3}>{tytul}</Heading>
        <EmptyState naglowek={pusty.naglowek} tresc={pusty.tresc} przycisk={pusty.przycisk} />
      </section>
    );
  }

  const suma = wiersze.reduce((laczna, wiersz) => laczna + wiersz.wartosc, 0);

  return (
    <section className={style.sekcja} aria-label={tytul}>
      <Heading stopien={3}>{tytul}</Heading>
      <div className={style.lista}>
        {wiersze.map((wiersz) => (
          <ListRow
            key={wiersz.id}
            wariant="z-licznikiem"
            tytul={wiersz.tytul}
            podpowiedz={wiersz.podpowiedz}
            plakietka={wiersz.plakietka}
            licznik={{ wartosc: wiersz.wartosc, etykieta: jednostkaSumy }}
            akcja={wiersz.akcja}
          />
        ))}
      </div>
      <div className={style.stopka}>
        <span>Razem</span>
        <Num wartosc={suma} etykieta={jednostkaSumy} />
      </div>
    </section>
  );
}
