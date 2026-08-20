import type { ReactNode } from "react";

export interface Column<T> {
  /** Unikalny klucz kolumny. */
  key: string;
  /** Nagłówek kolumny (po polsku). */
  header: string;
  /** Renderowanie komórki dla wiersza. */
  render: (row: T) => ReactNode;
  className?: string;
}

export interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  /** Klucz wiersza (stabilny identyfikator). */
  rowKey: (row: T) => string | number;
  /** Podpis tabeli dla czytników ekranu. */
  caption?: string;
  /** Komunikat pustego stanu. */
  emptyMessage?: string;
}

export default function Table<T>({
  columns,
  rows,
  rowKey,
  caption,
  emptyMessage = "Brak danych do wyświetlenia.",
}: TableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-card">
      <table className="w-full border-collapse text-left text-small">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-line bg-grey">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-4 py-3 text-caption font-bold uppercase tracking-wide text-muted ${col.className ?? ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-10 text-center text-body text-subtle"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-line last:border-b-0 odd:bg-card even:bg-page"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-body ${col.className ?? ""}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
