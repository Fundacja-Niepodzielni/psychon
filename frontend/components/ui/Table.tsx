"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

/** Skok przewijania na jedno naciśnięcie strzałki (px). */
const KROK_PRZEWIJANIA = 80;

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
  const kontenerRef = useRef<HTMLDivElement>(null);

  /**
   * Obszar przewijania w poziomie jest teraz osiągalny z klawiatury (Tab) i
   * ma własną rolę/nazwę — w Safari focus + strzałki to jedyny sposób, żeby
   * dosięgnąć ucięte kolumny bez myszy ani gestu dotykowego (axe
   * `scrollable-region-focusable`). Strzałki działają niezależnie od
   * przepełnienia — bez efektu, gdy nie ma czego przewijać.
   */
  function przewinKlawiszem(event: KeyboardEvent<HTMLDivElement>) {
    const el = kontenerRef.current;
    if (!el) return;
    if (event.key === "ArrowRight") {
      el.scrollLeft += KROK_PRZEWIJANIA;
    } else if (event.key === "ArrowLeft") {
      el.scrollLeft -= KROK_PRZEWIJANIA;
    }
  }

  return (
    <div
      ref={kontenerRef}
      role="region"
      aria-label={caption ?? "Zawartość tabeli przewijana w poziomie"}
      tabIndex={0}
      onKeyDown={przewinKlawiszem}
      className="overflow-x-auto rounded-md border border-line bg-card focus-visible:focus-ring"
    >
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
