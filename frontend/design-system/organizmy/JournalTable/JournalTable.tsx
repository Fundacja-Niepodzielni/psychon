import type { ComponentProps } from "react";
import { Heading } from "../../atomy/Heading/Heading";
import { Link } from "../../atomy/Link/Link";
import { Hint } from "../../atomy/Hint/Hint";
import { Field } from "../../molekuly/Field/Field";
import { DataTable, type KolumnaDataTable, type WierszDataTable } from "../DataTable/DataTable";
import style from "./JournalTable.module.css";

/** Filtr dziennika — właściwości `Field`; dla `rodzaj="wybor"` `Field` SAM
 * deleguje do `Select` (Field.tsx) — to jest droga, którą ten organizm
 * składa filtry z `Field` i `Select`: jedna implementacja pola wyboru
 * w całym froncie, nie druga, równoległa ścieżka z gołym `Select` obok
 * `Field`. */
export type FiltrJournalTable = ComponentProps<typeof Field>;

interface WlasciwosciSzukajkiJournalTable {
  id: string;
  etykieta: string;
  wartosc: string;
  onZmiana: (wartosc: string) => void;
  placeholder?: string;
}

interface WlasciwosciStronicowaniaJournalTable {
  strona: number;
  stron: number;
  naPoprzednia: () => void;
  naNastepna: () => void;
}

interface WlasciwosciJournalTable {
  tytul: string;
  filtry: FiltrJournalTable[];
  kolumny: KolumnaDataTable[];
  /** Wiersze PO zastosowaniu filtrów — jedyny zbiór, z którego ten organizm
   * liczy cokolwiek (licznik w `Hint` niżej, treść tabeli); wywołujący
   * filtruje PRZED przekazaniem, nie ten komponent — licznik
   * liczy z widoku po filtrze. Nowy wiersz „Wgląd w dane" po odsłonięciu
   * danych wrażliwych nie wymaga OSOBNEJ obsługi tutaj — to
   * zwykła zmiana tej samej tablicy, wywołująca zwykły ponowny render. */
  wiersze: WierszDataTable[];
  szukajka: WlasciwosciSzukajkiJournalTable;
  stronicowanie?: WlasciwosciStronicowaniaJournalTable;
  /** Odnośnik pobrania w nagłówku (np. eksport CSV dziennika). */
  pobranie?: { etykieta: string; href: string };
  /** Nadpisanie komunikatu pustego wyniku — domyślnie „Dla tego wyboru nie
   * ma zdarzeń. Zmień…", przekazane wprost do `DataTable.komunikatPusty`. */
  komunikatPusty?: string;
}

/**
 * Tabela dziennika `JournalTable`. Filtry (`Field` + `Select`, patrz
 * `FiltrJournalTable` wyżej) + `DataTable` (użyta, nie przepisana: ten plik
 * tylko przekazuje jej własne właściwości dalej) + `Hint` z licznikiem
 * widoku po filtrze + odnośnik pobrania w nagłówku.
 *
 * Obszar tabeli niesie własną nazwę dostępną (`aria-label={tytul}`, ten sam
 * tytuł co `DataTable` dostaje osobno dla swojego `role="table"`) i przyjmuje
 * fokus programowy (`tabIndex={-1}`) — ten sam wzorzec co `Notice`/`Dialog`:
 * wywołująca strona może przenieść uwagę na cały obszar po zmianie filtrów,
 * bez zgadywania, który wewnętrzny element sfokusować.
 */
/** Odmiana rzeczownika „zdarzenie" po liczbie: 1 → zdarzenie, liczby
 * kończące się na 2-4 poza 12-14 → zdarzenia, wszystkie pozostałe
 * (0, 5-21, 22-24, …) → zdarzeń — zwykła polska odmiana liczebnikowa. */
function odmienZdarzenia(liczba: number): string {
  if (liczba === 1) return "zdarzenie";
  const ostatniaCyfra = liczba % 10;
  const dwieOstatnieCyfry = liczba % 100;
  if (ostatniaCyfra >= 2 && ostatniaCyfra <= 4 && !(dwieOstatnieCyfry >= 12 && dwieOstatnieCyfry <= 14)) {
    return "zdarzenia";
  }
  return "zdarzeń";
}

export function JournalTable({
  tytul,
  filtry,
  kolumny,
  wiersze,
  szukajka,
  stronicowanie,
  pobranie,
  komunikatPusty,
}: WlasciwosciJournalTable) {
  return (
    <section className={style.obszar} aria-label={tytul} tabIndex={-1}>
      <div className={style.naglowek}>
        <Heading stopien={2}>{tytul}</Heading>
        {pobranie && <Link href={pobranie.href}>{pobranie.etykieta}</Link>}
      </div>

      {filtry.length > 0 && (
        <div className={style.filtry}>
          {filtry.map((filtr) => (
            <div key={filtr.id} className={style.filtr}>
              <Field {...filtr} />
            </div>
          ))}
        </div>
      )}

      <Hint>
        {`${wiersze.length} ${odmienZdarzenia(wiersze.length)} w tym widoku.`}
      </Hint>

      <DataTable
        tytul={tytul}
        kolumny={kolumny}
        wiersze={wiersze}
        szukajka={szukajka}
        stronicowanie={stronicowanie}
        komunikatPusty={komunikatPusty ?? "Dla tego wyboru nie ma zdarzeń. Zmień filtry i spróbuj ponownie."}
      />
    </section>
  );
}
