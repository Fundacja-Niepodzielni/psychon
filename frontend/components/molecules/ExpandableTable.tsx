"use client";

import { Fragment, useState, type ReactNode } from "react";
import DragHandle from "@/components/ui/DragHandle";
import type { Column } from "@/components/ui/Table";

export interface ExpandableTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  /** Klucz wiersza (stabilny identyfikator). */
  rowKey: (row: T) => string | number;
  /** Podpis tabeli dla czytników ekranu. */
  caption: string;
  emptyMessage?: string;
  /** Klucz wiersza aktualnie rozwiniętego — stan edycji żyje u wywołującego. */
  expandedRowKey?: string | number | null;
  /** Treść rozwinięcia pod wierszem (np. formularz edycji) — U-4/U-8. */
  renderExpanded?: (row: T) => ReactNode;
  /** Obecność włącza przeciąganie wierszy (dokłada kolumnę uchwytu) — U-9. */
  onReorder?: (fromIndex: number, toIndex: number) => void;
}

/**
 * `ExpandableTable` — płaska tabela (bez karty w karcie, Z-4/U-3) z
 * opcjonalnym rozwinięciem POD wierszem zamiast pod całą tabelą (U-4/U-8:
 * edycja bez przewijania) i opcjonalnym przeciąganiem wierszy z uchwytem
 * (U-9). Klawiaturowa droga zmiany kolejności NIE jest częścią tego
 * komponentu — zwykle to kolumna z `MoveButtons`, bo przeciąganie samo w
 * sobie nie jest dostępne z klawiatury.
 */
export default function ExpandableTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  emptyMessage = "Brak danych do wyświetlenia.",
  expandedRowKey = null,
  renderExpanded,
  onReorder,
}: ExpandableTableProps<T>) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const draggable = Boolean(onReorder);
  const columnCount = columns.length + (draggable ? 1 : 0);

  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className="overflow-x-auto rounded-card border border-line bg-card focus-visible:focus-ring"
    >
      <table className="w-full border-collapse text-left text-small">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line bg-grey">
            {draggable && (
              <th scope="col" className="w-10 px-2 py-3">
                <span className="sr-only">Uchwyt przeciągania</span>
              </th>
            )}
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
                colSpan={columnCount}
                className="px-4 py-10 text-center text-body text-muted"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => {
              const key = rowKey(row);
              const isDragOver =
                dragIndex !== null &&
                dragOverIndex === index &&
                dragIndex !== index;

              return (
                <Fragment key={key}>
                  <tr
                    className={`border-b border-line transition-colors duration-150 last:border-b-0 hover:bg-row-hover ${
                      isDragOver
                        ? "bg-accent-subtle outline outline-2 -outline-offset-2 outline-accent"
                        : ""
                    }`}
                    onDragOver={
                      draggable
                        ? (e) => {
                            if (dragIndex === null) return;
                            e.preventDefault();
                            setDragOverIndex(index);
                          }
                        : undefined
                    }
                    onDragLeave={
                      draggable
                        ? () =>
                            setDragOverIndex((prev) =>
                              prev === index ? null : prev,
                            )
                        : undefined
                    }
                    onDrop={
                      draggable
                        ? (e) => {
                            e.preventDefault();
                            if (dragIndex !== null) {
                              onReorder?.(dragIndex, index);
                            }
                            setDragIndex(null);
                            setDragOverIndex(null);
                          }
                        : undefined
                    }
                  >
                    {draggable && (
                      <td className="px-2 py-3">
                        <DragHandle
                          onDragStart={(e) => {
                            setDragIndex(index);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            setDragIndex(null);
                            setDragOverIndex(null);
                          }}
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-3 text-body ${col.className ?? ""}`}
                      >
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                  {expandedRowKey === key && renderExpanded && (
                    <tr className="border-b border-line last:border-b-0">
                      <td colSpan={columnCount} className="p-0">
                        {renderExpanded(row)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
