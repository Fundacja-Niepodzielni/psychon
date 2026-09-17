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
    <div
      role="region"
      aria-label={caption ?? "Zawartość tabeli przewijana w poziomie"}
      tabIndex={0}
      className="overflow-x-auto rounded-card border border-line bg-card focus-visible:focus-ring"
    >
      {/* Z-10: przewijanie w bok dozwolone tylko z widocznym oznaczeniem. */}
      <p className="sticky left-0 border-b border-line px-4 py-2 text-caption text-muted sm:hidden">
        Tabela przewija się w bok.
      </p>
      <table className="w-full border-collapse text-left text-small">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-line bg-grey">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`px-4 py-3 text-caption font-semibold uppercase tracking-label text-muted ${col.className ?? ""}`}
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
                className="px-4 py-10 text-center text-body text-muted"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-line transition-colors duration-150 last:border-b-0 hover:bg-row-hover"
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
