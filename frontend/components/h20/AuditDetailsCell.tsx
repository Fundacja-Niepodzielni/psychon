"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

const PODGLAD_LIMIT = 120;

/**
 * Bezpieczne odwzorowanie ładunku zdarzenia na tekst. Ładunek pochodzi z
 * odpowiedzi JSON, więc `JSON.stringify` nie powinien rzucić wyjątku — mimo
 * to zawsze łapiemy błąd, żeby nieznany kształt (np. wartość niedającą się
 * zserializować) nigdy nie wywalił komponentu, tylko pokazał zastępczy tekst.
 */
function stringifyDetails(details: Record<string, unknown>, pretty: boolean): string {
  try {
    const wynik = JSON.stringify(details, null, pretty ? 2 : undefined);
    return wynik ?? "—";
  } catch {
    return "Nie udało się odczytać treści ładunku.";
  }
}

export interface AuditDetailsCellProps {
  details: Record<string, unknown> | null;
}

/**
 * Kolumna „Szczegóły" dziennika działań (H20). Pusty ładunek renderuje jawny
 * myślnik. Niepusty ładunek dostaje skrócony podgląd w tabeli i pełną treść
 * po rozwinięciu, w przewijanym kontenerze — dowolny rozmiar i dowolny
 * kształt (zagnieżdżone tablice/obiekty) nie rozbija układu tabeli.
 *
 * Ta sama treść (ten sam ładunek `details`) trafia też do eksportu CSV
 * (`AuditLogEntryResource::toCsvRow`, pole `details`, zakodowane przez
 * `json_encode(..., JSON_UNESCAPED_UNICODE)`) — jedyna różnica to formatowanie
 * (zwarty JSON w podglądzie/CSV kontra JSON z wcięciami po rozwinięciu tutaj),
 * nie treść pól.
 */
export default function AuditDetailsCell({ details }: AuditDetailsCellProps) {
  const [rozwiniete, setRozwiniete] = useState(false);

  if (details === null || Object.keys(details).length === 0) {
    return <span className="text-muted">—</span>;
  }

  const podglad = stringifyDetails(details, false);
  const pelnaTresc = stringifyDetails(details, true);
  const skrocony =
    podglad.length > PODGLAD_LIMIT ? `${podglad.slice(0, PODGLAD_LIMIT)}…` : podglad;

  return (
    <div className="max-w-xs">
      <div className="flex items-start gap-2">
        <code className="min-w-0 flex-1 truncate text-caption text-muted" title={podglad}>
          {skrocony}
        </code>
        <Button
          type="button"
          variant="ghost"
          className="shrink-0 px-2 py-1 text-caption"
          aria-expanded={rozwiniete}
          onClick={() => setRozwiniete((v) => !v)}
        >
          {rozwiniete ? "Zwiń" : "Szczegóły"}
        </Button>
      </div>
      {rozwiniete && (
        <pre className="mt-2 max-h-64 w-full max-w-sm overflow-auto whitespace-pre-wrap break-words rounded-card border border-line bg-grey p-2 text-caption">
          {pelnaTresc}
        </pre>
      )}
    </div>
  );
}
