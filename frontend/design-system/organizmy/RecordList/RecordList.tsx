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
  /** Widoczny napis akcji (np. „Otwórz”). */
  etykieta: string;
  /** Pełna nazwa akcji dla czytnika (np. „Otwórz: Dyżury”); bez niej czytnik dostaje `etykieta`. */
  etykietaDostepna?: string;
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
   * źródło prawdy, bez osobnego pola tylko do wyświetlenia. OPCJONALNA:
   * pomiń razem z `jednostkaSumy` niżej, gdy wiersz nie ma wartości, którą
   * miałoby sens sumować (np. ranga/kolejność) — wtedy ani licznik przy
   * wierszu, ani stopka „Razem” się nie renderują. */
  wartosc?: number;
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
  /** Jednostka/mianownik sumy w stopce (KO-6, jak `Num`/`StatTile`).
   * Napis stoi przy każdej liczbie bez zmian; funkcja `(liczba) => napis`
   * dostaje liczbę wiersza albo sumy i zwraca jednostkę w odpowiedniej
   * formie (odmiana liczebnika po stronie wołającego — DS nie zna języka).
   * OPCJONALNA — pomiń, gdy `wartosc` wierszy nie ma sensownej sumy
   * zbiorczej (np. ranga/kolejność); stopka „Razem” wtedy się nie
   * renderuje, zamiast pokazywać liczbę bez znaczenia. */
  jednostkaSumy?: string | ((liczba: number) => string);
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

  const jednostka = (liczba: number): string =>
    typeof jednostkaSumy === "function" ? jednostkaSumy(liczba) : (jednostkaSumy ?? "");
  const maSume = jednostkaSumy !== undefined && wiersze.every((wiersz) => wiersz.wartosc !== undefined);
  const suma = maSume ? wiersze.reduce((laczna, wiersz) => laczna + (wiersz.wartosc ?? 0), 0) : 0;

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
            licznik={
              jednostkaSumy !== undefined && wiersz.wartosc !== undefined
                ? { wartosc: wiersz.wartosc, etykieta: jednostka(wiersz.wartosc) }
                : undefined
            }
            akcja={wiersz.akcja}
          />
        ))}
      </div>
      {maSume && (
        <div className={style.stopka}>
          <span>Razem</span>
          <Num wartosc={suma} etykieta={jednostka(suma)} />
        </div>
      )}
    </section>
  );
}
