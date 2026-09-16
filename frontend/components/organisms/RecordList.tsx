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
  /** Akcja pod komunikatem stanu pustego (Z-6: „co teraz zrobić"), np. link
   * do formularza dodania pierwszej pozycji. Pominięta = bez akcji. */
  emptyAction?: ReactNode;
  caption?: string;
  className?: string;
}

/**
 * `RecordList` — organizm C2 wariant C: ta sama lista jako karty na
 * telefonie. Przełączanie między tą listą a `DataTable` wg szerokości
 * ekranu zostaje po stronie strony, która łączy oba organizmy —
 * `RecordList` sam się nie chowa wg szerokości i działa samodzielnie, gdy
 * strona chce tylko listy kart. Stany ładowanie/błąd/odmowa są wspólne z
 * `DataTable` (ta sama dana) i zostają po stronie wywołującego; stan pusty
 * ma tu własny widok z opcjonalną akcją.
 */
export default function RecordList<T>({
  rows,
  rowKey,
  renderItem,
  renderAction,
  emptyMessage = "Brak danych do wyświetlenia.",
  emptyAction,
  caption,
  className = "",
}: RecordListProps<T>) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3" role="status">
        <p className="text-body text-subtle">{emptyMessage}</p>
        {emptyAction}
      </div>
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
            <div className="flex flex-col items-start gap-1">{renderItem(row)}</div>
            {renderAction && <div>{renderAction(row)}</div>}
          </Card>
        </li>
      ))}
    </ul>
  );
}
