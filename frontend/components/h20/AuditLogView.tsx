"use client";

import { useEffect, useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Table, { type Column } from "@/components/ui/Table";
import {
  ApiError,
  AUDIT_ACTIONS,
  downloadAuditLogCsv,
  fetchAuditLog,
  type AuditFilters,
  type AuditLogEntryDto,
  type PaginationMeta,
} from "@/lib/api";
import { ACTION_LABELS } from "@/lib/h20/labels";

interface Loaded {
  key: string;
  rows: AuditLogEntryDto[];
  meta?: PaginationMeta;
}

const EMPTY_FILTERS = { action: "", userId: "", from: "", to: "" };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function AuditLogView() {
  const [form, setForm] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState<AuditFilters>({});
  const [page, setPage] = useState(1);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null);

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const key = JSON.stringify({ ...applied, page });

  useEffect(() => {
    let active = true;
    fetchAuditLog({ ...applied, page, per_page: 25 })
      .then(({ data, meta }) => {
        if (active) setLoaded({ key, rows: data, meta });
      })
      .catch((err: unknown) => {
        if (!active) return;
        setFailed({
          key,
          message:
            err instanceof ApiError
              ? err.message
              : "Nie udało się wczytać dziennika działań.",
        });
      });
    return () => {
      active = false;
    };
  }, [applied, page, key]);

  function applyFilters(e: FormEvent) {
    e.preventDefault();
    setPage(1);
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

  const showError = failed?.key === key;
  const showData = loaded?.key === key;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h2 font-black text-ink">Dziennik działań</h1>
          <p className="mt-2 text-body text-muted">
            Odczyt wyłącznie — żadne zdarzenie w tym dzienniku nie da się
            zmienić ani usunąć.
          </p>
        </div>
        <Button variant="secondary" onClick={exportCsv} loading={downloading}>
          Eksport CSV
        </Button>
      </div>

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

      {showError ? (
        <Alert variant="error">{failed.message}</Alert>
      ) : !showData ? (
        <p role="status" className="text-body text-muted">
          Wczytywanie dziennika…
        </p>
      ) : (
        <>
          <Table
            columns={columns}
            rows={loaded.rows}
            rowKey={(row) => row.id}
            caption="Dziennik działań"
            emptyMessage="Brak zdarzeń spełniających kryteria."
          />
          {loaded.meta && loaded.meta.last_page > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((v) => Math.max(1, v - 1))}
              >
                Poprzednia
              </Button>
              <span className="text-small text-subtle">
                Strona {loaded.meta.current_page} z {loaded.meta.last_page}
              </span>
              <Button
                variant="secondary"
                disabled={page >= loaded.meta.last_page}
                onClick={() => setPage((v) => v + 1)}
              >
                Następna
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
