"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import EmptyState from "@/components/molecules/EmptyState";
import ErrorState from "@/components/molecules/ErrorState";
import ForbiddenState from "@/components/molecules/ForbiddenState";
import LoadingState from "@/components/molecules/LoadingState";
import Pagination, { type PaginationProps } from "@/components/molecules/Pagination";

export type DataTableStan = "loading" | "error" | "forbidden" | "empty" | "success";

export interface DataTableSort {
  key: string;
  direction: "asc" | "desc";
}

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Kolumna sortowalna klawiaturą i myszą, z `aria-sort` na `<th>`. */
  sortable?: boolean;
  className?: string;
}

export type DataTablePaginacja = Pick<PaginationProps, "strona" | "ostatniaStrona" | "onZmien">;

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  caption?: string;
  stan: DataTableStan;
  /** Sortowanie bieżące — `null`/pominięte = bez sortowania. */
  sort?: DataTableSort | null;
  onSortChange?: (key: string) => void;
  /** Renderowany nad tabelą w każdym stanie (Z-14: filtry nie chowają się,
   * nawet gdy lista jest pusta albo się ładuje). Zwykle `<FilterBar>`. */
  filterBar?: ReactNode;
  paginacja?: DataTablePaginacja;
  komunikatLadowania?: string;
  komunikatBledu?: string;
  komunikatBleduTytul?: string;
  onPonow?: () => void;
  komunikatBrakUprawnien?: string;
  pustyTytul?: string;
  pustyOpis?: string;
  pustaAkcja?: ReactNode;
}

/**
 * `DataTable` — organizm C2 wariant C: tabela + sortowanie po kolumnie
 * (klawiatura, `aria-sort`) + 5 stanów Z-6 (ładowanie / błąd / pusty /
 * odmowa / dane) + `Pagination` + `FilterBar` (przez slot `filterBar`, żeby
 * organizm nie narzucał konkretnego zestawu filtrów). Przełączanie na widok
 * kart (`RecordList`) na wąskim ekranie zostaje po stronie strony, która
 * łączy oba organizmy — `DataTable` sam się nie chowa wg szerokości.
 *
 * Wiersze mają jednolite tło (`bg-card`), bez naprzemiennego cieniowania
 * `Table.tsx` (`odd:bg-card even:bg-page`): zmierzone axe-core naruszenie —
 * plakietka `Badge variant="success"` (`bg-success-bg` na `text-success`)
 * spada na wierszu z tłem `bg-page` do 4,33:1, poniżej progu Z-9 (4,5:1).
 * Token pozostaje poza zakresem tego organizmu (zakaz ruszania tokenów),
 * więc usunięte zostało cieniowanie wierszy tutaj zamiast tokenu.
 *
 * Nagłówek tabeli renderuje własną strukturę zamiast `components/ui/Table`
 * — `Table.Column.header` jest typu `string` (bez miejsca na przycisk
 * sortowania). Wygląd wiersza/komórki zostaje identyczny z `Table` (te same
 * klasy tokenów), więc wizualnie to ten sam komponent z dodaną interakcją
 * nagłówka.
 */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  stan,
  sort,
  onSortChange,
  filterBar,
  paginacja,
  komunikatLadowania,
  komunikatBledu = "Nie udało się połączyć z serwerem. Spróbuj ponownie.",
  komunikatBleduTytul,
  onPonow,
  komunikatBrakUprawnien,
  pustyTytul = "Brak danych do wyświetlenia.",
  pustyOpis,
  pustaAkcja,
}: DataTableProps<T>) {
  const ariaSortFor = (col: DataTableColumn<T>): "ascending" | "descending" | "none" | undefined => {
    if (!col.sortable) return undefined;
    if (!sort || sort.key !== col.key) return "none";
    return sort.direction === "asc" ? "ascending" : "descending";
  };

  const kontenerRef = useRef<HTMLDivElement>(null);
  const [przewijaSie, setPrzewijaSie] = useState(false);

  useEffect(() => {
    const el = kontenerRef.current;
    if (!el) return;
    const sprawdzPrzepelnienie = () => setPrzewijaSie(el.scrollWidth > el.clientWidth);
    sprawdzPrzepelnienie();
    const observer = new ResizeObserver(sprawdzPrzepelnienie);
    observer.observe(el);
    window.addEventListener("resize", sprawdzPrzepelnienie);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", sprawdzPrzepelnienie);
    };
  }, [columns, rows]);

  return (
    <div className="flex flex-col gap-4">
      {filterBar}

      {stan === "loading" && <LoadingState label={komunikatLadowania} />}
      {stan === "error" && (
        <ErrorState message={komunikatBledu} title={komunikatBleduTytul} onRetry={onPonow} />
      )}
      {stan === "forbidden" && <ForbiddenState message={komunikatBrakUprawnien} />}
      {stan === "empty" && (
        <EmptyState title={pustyTytul} description={pustyOpis} action={pustaAkcja} />
      )}
      {stan === "success" && (
        <>
          {/* Z-10: oznaczenie widoczne dokładnie wtedy, gdy kontener realnie
           * przepełnia się (scrollWidth > clientWidth), niezależnie od
           * liczby kolumn — mierzone w przeglądarce, nie zakładane ze
           * statycznego progu. Kontener przewija się we własnym zakresie,
           * strona nie (zmierzone przy 360 px). */}
          {przewijaSie && (
            <p aria-hidden="true" className="px-1 text-caption text-subtle">
              Przewiń w bok, żeby zobaczyć pozostałe kolumny →
            </p>
          )}
          <div ref={kontenerRef} className="overflow-x-auto rounded-md border border-line bg-card">
            <table className="w-full border-collapse text-left text-small">
              {caption && <caption className="sr-only">{caption}</caption>}
              <thead>
                <tr className="border-b border-line bg-grey">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      scope="col"
                      aria-sort={ariaSortFor(col)}
                      className={`px-4 py-3 text-caption font-bold uppercase tracking-wide text-muted ${col.className ?? ""}`}
                    >
                      {col.sortable ? (
                        <button
                          type="button"
                          onClick={() => onSortChange?.(col.key)}
                          className="inline-flex min-h-11 items-center gap-1 rounded-xs focus-visible:focus-ring"
                        >
                          {col.header}
                          <span aria-hidden="true">
                            {sort?.key === col.key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}
                          </span>
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    className="border-b border-line bg-card last:border-b-0"
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={`px-4 py-3 text-body ${col.className ?? ""}`}>
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {paginacja && paginacja.ostatniaStrona > 1 && <Pagination {...paginacja} />}
        </>
      )}
    </div>
  );
}
