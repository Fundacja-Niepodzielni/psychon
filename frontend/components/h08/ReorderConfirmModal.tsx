"use client";

import { useEffect, useRef, type MouseEvent, type SyntheticEvent } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Table, { type Column } from "@/components/ui/Table";
import { COURSE_STATE_LABELS, type ReorderImpactRow } from "@/lib/h08/types";

export interface ReorderConfirmModalProps {
  open: boolean;
  /** Podgląd wpływu z `POST /admin/courses/reorder/preview`. */
  rows: ReorderImpactRow[];
  /** Zapis kolejności w toku. */
  loading?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

const columns: Column<ReorderImpactRow>[] = [
  {
    key: "person",
    header: "Osoba",
    render: (row) => `${row.first_name} ${row.last_name}`,
  },
  { key: "course", header: "Kurs", render: (row) => row.course_title },
  {
    key: "from",
    header: "Było",
    render: (row) => COURSE_STATE_LABELS[row.from] ?? row.from,
  },
  {
    key: "to",
    header: "Będzie",
    render: (row) => COURSE_STATE_LABELS[row.to] ?? row.to,
  },
];

/**
 * Potwierdzenie zmiany kolejności ścieżki (kryterium 3 karty H08).
 *
 * Design system nie ma komponentu modala i nie wolno dokładać bibliotek UI,
 * więc stoimy na natywnym `<dialog>` z `showModal()`: warstwa górna, `Esc`
 * i pułapka focusu są wtedy zachowaniem przeglądarki, nie naszym kodem.
 */
export default function ReorderConfirmModal({
  open,
  rows,
  loading = false,
  error = null,
  onCancel,
  onConfirm,
}: ReorderConfirmModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // `Esc` zamykamy przez stan rodzica — inaczej dialog i stan się rozjeżdżają.
  function handleCancelEvent(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    if (!loading) onCancel();
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current && !loading) onCancel();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="h08-reorder-title"
      onCancel={handleCancelEvent}
      onClick={handleBackdropClick}
      className="m-auto w-[min(92vw,44rem)] rounded-lg border border-line bg-card p-0 text-body shadow-card backdrop:bg-ink/40"
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 id="h08-reorder-title" className="text-h4 font-bold text-ink">
          Potwierdź zmianę kolejności
        </h2>
        <p className="text-small text-muted">
          Nowa kolejność ścieżki przestawia statusy kursów uczestniczkom
          i uczestnikom. Poniżej lista osób, których to dotyczy.
        </p>

        {error && <Alert variant="error">{error}</Alert>}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(row) => `${row.user_id}-${row.course_id}`}
          caption="Wpływ nowej kolejności na statusy kursów"
          emptyMessage="Ta zmiana nie zmienia statusu żadnej osoby."
        />

        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            Anuluj
          </Button>
          <Button variant="primary" loading={loading} onClick={onConfirm}>
            Potwierdź zmianę kolejności
          </Button>
        </div>
      </div>
    </dialog>
  );
}
