import type { ReactNode } from "react";
import Card from "@/components/ui/Card";

export interface RecordListProps<T> {
  rows: T[];
  rowKey: (row: T) => string | number;
  /** Treść karty — ta sama dana co wiersz `DataTable`, inny układ (Z-10:
   * wąski ekran jest pełnoprawnym ekranem, więc lista kart zastępuje
   * przewijaną w bok tabelę). */
  renderItem: (row: T) => ReactNode;
  /** Najwyżej jedna akcja na kartę (Z-13). */
  renderAction?: (row: T) => ReactNode;
  emptyMessage?: string;
  caption?: string;
  className?: string;
}

/**
 * `RecordList` — organizm C2 wariant C (partia P3a): ta sama lista jako
 * karty na telefonie. Sam nie decyduje o widoczności wg szerokości ekranu
 * (`md:hidden` itp.) — to zależy od tego, jak strona łączy go z `DataTable`;
 * organizm ma działać samodzielnie, gdy strona chce tylko listy kart.
 * Stany ładowanie/błąd/pusty/odmowa są wspólne z `DataTable` (ta sama dana)
 * i zostają po stronie wywołującego — tu renderowany jest tylko stan „dane".
 */
export default function RecordList<T>({
  rows,
  rowKey,
  renderItem,
  renderAction,
  emptyMessage = "Brak danych do wyświetlenia.",
  caption,
  className = "",
}: RecordListProps<T>) {
  if (rows.length === 0) {
    return (
      <p className="text-body text-subtle" role="status">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul
      aria-label={caption}
      className={`flex flex-col gap-3 ${className}`}
    >
      {rows.map((row) => (
        <li key={rowKey(row)}>
          <Card className="flex min-h-11 flex-col gap-3">
            <div className="flex flex-col gap-1">{renderItem(row)}</div>
            {renderAction && <div>{renderAction(row)}</div>}
          </Card>
        </li>
      ))}
    </ul>
  );
}
