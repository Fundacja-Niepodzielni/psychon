"use client";

import { useCallback, useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Table, { type Column } from "@/components/ui/Table";
import ListTemplate, { type StanListy } from "@/components/templates/ListTemplate";
import { useZasobStronicowany } from "@/lib/hooks/useZasobStronicowany";
import {
  ApiError,
  AUDIT_ACTIONS,
  downloadAuditLogCsv,
  fetchAuditLog,
  type AuditFilters,
  type AuditLogEntryDto,
} from "@/lib/api";
import { ACTION_LABELS } from "@/lib/h20/labels";

const EMPTY_FILTERS = { action: "", userId: "", from: "", to: "" };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Dziennik działań (H20), na `ListTemplate` (C2 wariant C). Jak w H18: 403
 * odróżniony od pozostałych błędów bezpośrednio przy wołaniu `fetchAuditLog`,
 * bo `useZasobStronicowany` niesie dalej tylko komunikat, nie status.
 */
export default function AuditLogView() {
  const [form, setForm] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState<AuditFilters>({});
  const [forbidden, setForbidden] = useState(false);

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const pobierz = useCallback(
    (strona: number) =>
      fetchAuditLog({ ...applied, page: strona, per_page: 25 })
        .then((wynik) => {
          setForbidden(false);
          return wynik;
        })
        .catch((err: unknown) => {
          if (err instanceof ApiError && err.status === 403) setForbidden(true);
          throw err;
        }),
    [applied],
  );

  const { stan, meta, strona, ustawStrone, ponow } = useZasobStronicowany<AuditLogEntryDto>(
    pobierz,
    [applied],
    "Nie udało się wczytać dziennika działań.",
  );

  const dane = stan.status === "success" ? stan.data : [];
  const listaPusta = stan.status === "success" && dane.length === 0;
  const stanEfektywny: StanListy = forbidden
    ? "forbidden"
    : listaPusta
      ? "empty"
      : stan.status;

  function applyFilters(e: FormEvent) {
    e.preventDefault();
    ustawStrone(1);
    setApplied({
      action: form.action || undefined,
      user_id: form.userId ? Number(form.userId) : undefined,
      from: form.from || undefined,
      to: form.to || undefined,
    });
  }

  async function exportCsv() {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadAuditLogCsv(applied);
    } catch (err) {
      setDownloadError(
        err instanceof ApiError ? err.message : "Nie udało się pobrać pliku CSV.",
      );
    } finally {
      setDownloading(false);
    }
  }

  const columns: Column<AuditLogEntryDto>[] = [
    { key: "when", header: "Kiedy", render: (row) => formatDate(row.created_at) },
    {
      key: "action",
      header: "Zdarzenie",
      render: (row) => ACTION_LABELS[row.action as keyof typeof ACTION_LABELS] ?? row.action,
    },
    {
      key: "actor",
      header: "Kto",
      render: (row) =>
        row.actor ? `${row.actor.first_name} ${row.actor.last_name}` : "—",
    },
    {
      key: "subject",
      header: "Dotyczy",
      render: (row) =>
        row.subject_type ? `${row.subject_type} #${row.subject_id}` : "—",
    },
  ];

  return (
    <ListTemplate
      naglowek={{
        title: "Dziennik działań",
        description:
          "Odczyt wyłącznie — żadne zdarzenie w tym dzienniku nie da się zmienić ani usunąć.",
        action: (
          <Button variant="secondary" onClick={exportCsv} loading={downloading}>
            Eksport CSV
          </Button>
        ),
      }}
      stan={stanEfektywny}
      komunikatBledu={stan.status === "error" ? stan.message : undefined}
      onPonow={ponow}
      pustyTytul="Brak zdarzeń spełniających kryteria."
      paginacja={
        meta ? { strona, ostatniaStrona: meta.last_page, onZmien: ustawStrone } : undefined
      }
      dodatkowyPanel={
        <>
          {downloadError && <Alert variant="error">{downloadError}</Alert>}
          <form
            onSubmit={applyFilters}
            className="grid gap-4 sm:grid-cols-[1fr_140px_160px_160px_auto] sm:items-end"
          >
            <Select
              label="Zdarzenie"
              value={form.action}
              onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))}
            >
              <option value="">Wszystkie zdarzenia</option>
              {AUDIT_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {ACTION_LABELS[action]}
                </option>
              ))}
            </Select>
            <Input
              label="ID osoby"
              inputMode="numeric"
              value={form.userId}
              onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
              placeholder="np. 6"
            />
            <Input
              label="Od"
              type="date"
              value={form.from}
              onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))}
            />
            <Input
              label="Do"
              type="date"
              value={form.to}
              onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}
            />
            <Button type="submit">Filtruj</Button>
          </form>
        </>
      }
    >
      <Table
        columns={columns}
        rows={dane}
        rowKey={(row) => row.id}
        caption="Dziennik działań"
        emptyMessage="Brak zdarzeń spełniających kryteria."
      />
    </ListTemplate>
  );
}
