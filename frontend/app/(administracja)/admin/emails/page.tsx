"use client";

import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Table, { type Column } from "@/components/ui/Table";
import ListTemplate from "@/components/templates/ListTemplate";
import { apiPaged, type PaginationMeta } from "@/lib/api";
import { useZasobStronicowany } from "@/lib/hooks/useZasobStronicowany";
import type { EmailItem } from "@/lib/notifications/types";

const STATUS_LABEL: Record<EmailItem["status"], string> = {
  queued: "W kolejce",
  sent: "Wysłano",
  failed: "Błąd",
  simulated: "Symulowany",
};

const STATUS_VARIANT: Record<
  EmailItem["status"],
  "neutral" | "success" | "warning" | "danger" | "info" | "accent"
> = {
  queued: "neutral",
  sent: "success",
  failed: "danger",
  simulated: "info",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function pobierzEmaile(
  strona: number,
): Promise<{ data: EmailItem[]; meta?: PaginationMeta }> {
  return apiPaged<EmailItem>(`/admin/emails?page=${strona}&per_page=25`);
}

/**
 * H16 · Skrzynka e-maili symulowanych (#/admin/emails), na `ListTemplate`
 * (C2 wariant C). Nic nigdy nie wychodzi w świat — status jest zawsze
 * `simulated` na hackathonie.
 */
export default function AdminEmailsPage() {
  const [preview, setPreview] = useState<EmailItem | null>(null);
  const { stan, meta, strona, ustawStrone, ponow } = useZasobStronicowany<EmailItem>(
    pobierzEmaile,
    [],
    "Nie udało się połączyć z serwerem. Sprawdź, czy backend działa.",
  );

  const dane = stan.status === "success" ? stan.data : [];
  const listaPusta = stan.status === "success" && dane.length === 0;

  const columns: Column<EmailItem>[] = [
    {
      key: "to_email",
      header: "Odbiorca",
      render: (row) => <span className="font-medium text-ink">{row.to_email}</span>,
    },
    { key: "subject", header: "Temat", render: (row) => row.subject },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
      ),
    },
    {
      key: "sent_at",
      header: "Czas",
      render: (row) => formatDateTime(row.sent_at ?? row.created_at),
    },
    {
      key: "actions",
      header: "Podgląd",
      render: (row) => (
        <button
          type="button"
          onClick={() => setPreview(row)}
          className="text-small font-medium text-primary hover:underline focus-visible:focus-ring"
        >
          Podgląd
        </button>
      ),
    },
  ];

  return (
    <>
      <ListTemplate
        naglowek={{
          title: "Skrzynka e-maili",
          action: meta && <Badge variant="accent">{meta.total} łącznie</Badge>,
        }}
        stan={listaPusta ? "empty" : stan.status}
        komunikatBledu={stan.status === "error" ? stan.message : undefined}
        onPonow={ponow}
        pustyTytul="Brak wysłanych e-maili"
        paginacja={
          meta
            ? { strona, ostatniaStrona: meta.last_page, onZmien: ustawStrone }
            : undefined
        }
      >
        <Table
          columns={columns}
          rows={dane}
          rowKey={(row) => row.id}
          caption="Wysłane (symulowane) e-maile"
          emptyMessage="Brak wysłanych e-maili."
        />
      </ListTemplate>

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Podgląd e-maila — ${preview.subject}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-md border border-line bg-card shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line bg-card-warm px-6 py-4">
              <div>
                <p className="text-h4 font-bold text-ink">{preview.subject}</p>
                <Badge variant={STATUS_VARIANT[preview.status]} className="mt-2">
                  {STATUS_LABEL[preview.status]}
                </Badge>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="Zamknij podgląd"
                className="rounded-pill p-1 text-subtle hover:bg-grey hover:text-ink focus-visible:focus-ring"
              >
                ✕
              </button>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-6 py-4 text-small">
              <dt className="font-bold text-muted">Od:</dt>
              <dd className="text-ink">Fundacja Niepodzielni &lt;no-reply@niepodzielni.pl&gt;</dd>
              <dt className="font-bold text-muted">Do:</dt>
              <dd className="text-ink">{preview.to_email}</dd>
              <dt className="font-bold text-muted">Wysłano:</dt>
              <dd className="text-ink">{formatDateTime(preview.sent_at ?? preview.created_at)}</dd>
            </dl>

            <div className="border-t border-line px-6 py-5">
              {preview.body_html ? (
                // Treść generuje wyłącznie Notify::send po stronie backendu
                // (nl2br(e($body))) — bezpieczny, zescapowany HTML.
                <div
                  className="text-body text-body"
                  dangerouslySetInnerHTML={{ __html: preview.body_html }}
                />
              ) : (
                <p className="text-body text-subtle">Brak treści.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
