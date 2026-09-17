import Card from "@/components/ui/Card";

export interface ForbiddenStateProps {
  /** Nie zawiera słów „błąd" ani „nie udało się" — odmowa roli nigdy nie
   * wygląda jak awaria (Z-6, Z-7). */
  message?: string;
  className?: string;
  /** Gdy `true`, treść renderuje się bez własnej karty — dla użycia wewnątrz
   * karty, która już istnieje na ekranie (bez podwójnej ramki). */
  embedded?: boolean;
}

/**
 * `ForbiddenState` — molekuła C2 wariant C, wersja osadzona w treści listy
 * (dla pełnoekranowej odmowy patrz `components/permissions/Forbidden403.tsx`,
 * który zostaje bez zmian w P1).
 */
export default function ForbiddenState({
  message = "Nie masz uprawnień do wyświetlenia tej listy.",
  className = "",
  embedded = false,
}: ForbiddenStateProps) {
  const tresc = (
    <>
      <p className="text-caption font-bold uppercase tracking-wide text-subtle">
        Brak dostępu
      </p>
      <p className="mt-2 text-body text-muted">{message}</p>
    </>
  );

  if (embedded) {
    return <div className={`text-center ${className}`}>{tresc}</div>;
  }

  return <Card className={`text-center ${className}`}>{tresc}</Card>;
}
