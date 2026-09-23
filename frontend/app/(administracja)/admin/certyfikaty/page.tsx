"use client";

import { useState } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Table, { type Column } from "@/components/ui/Table";
import ListTemplate from "@/components/templates/ListTemplate";
import ConfirmDialog from "@/components/organisms/ConfirmDialog";
import { ApiError } from "@/lib/api";
import { useZasobStronicowany } from "@/lib/hooks/useZasobStronicowany";
import {
  fetchAdminCertificates,
  revokeCertificate,
  type AdminCertificate,
} from "@/lib/h13/types";

const STATUS_LABEL: Record<AdminCertificate["status"], string> = {
  valid: "Ważny",
  revoked: "Unieważniony",
};

const STATUS_VARIANT: Record<AdminCertificate["status"], "success" | "danger"> = {
  valid: "success",
  revoked: "danger",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * H13 · Lista wydanych certyfikatów i ich unieważnianie („administracja
 * unieważnia certyfikat z powodem"). Trasa
 * zaplecza istniała bez odbiorcy w interfejsie — ten ekran jest pierwszym.
 *
 * Wzorzec ekranu (ListTemplate + `useZasobStronicowany`) po `admin/emails`;
 * okno powodu unieważnienia po oknie odrzucenia zgłoszenia
 * (`components/h03/ApplicationsTab.tsx`, ta sama para pól „powód wymagany").
 */
export default function AdminCertificatesPage() {
  const { stan, meta, strona, ustawStrone, ponow } = useZasobStronicowany<AdminCertificate>(
    fetchAdminCertificates,
    [],
    "Nie udało się połączyć z serwerem. Sprawdź, czy backend działa.",
  );

  const [revoking, setRevoking] = useState<AdminCertificate | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const dane = stan.status === "success" ? stan.data : [];
  const listaPusta = stan.status === "success" && dane.length === 0;

  function openRevoke(certificate: AdminCertificate) {
    setRevoking(certificate);
    setReason("");
    setReasonError(null);
    setActionError(null);
    setSuccess(null);
  }

  async function confirmRevoke() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setReasonError("Podaj powód unieważnienia.");
      return;
    }
    if (!revoking) return;
    setPendingId(revoking.id);
    setReasonError(null);
    setActionError(null);
    try {
      await revokeCertificate(revoking.id, trimmed);
      setRevoking(null);
      setSuccess(`Certyfikat ${revoking.number} został unieważniony.`);
      ponow();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.errors?.reason?.[0]) {
        setReasonError(err.errors.reason[0]);
      } else {
        setActionError(
          err instanceof ApiError ? err.message : "Nie udało się unieważnić certyfikatu.",
        );
      }
    } finally {
      setPendingId(null);
    }
  }

  const columns: Column<AdminCertificate>[] = [
    {
      key: "number",
      header: "Numer",
      render: (row) => <span className="font-medium text-ink">{row.number}</span>,
    },
    {
      key: "user",
      header: "Osoba",
      render: (row) => (row.user ? `${row.user.first_name} ${row.user.last_name}` : "—"),
    },
    { key: "edition", header: "Edycja", render: (row) => row.edition ?? "—" },
    { key: "issued_at", header: "Wydano", render: (row) => formatDateTime(row.issued_at) },
    {
      key: "status",
      header: "Status",
      render: (row) => <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>,
    },
    {
      key: "actions",
      header: "Akcje",
      render: (row) =>
        row.status === "valid" ? (
          <button
            type="button"
            className="min-h-11 text-small font-medium text-danger hover:underline focus-visible:focus-ring"
            onClick={() => openRevoke(row)}
            disabled={pendingId !== null}
          >
            Unieważnij
          </button>
        ) : (
          <span className="text-small text-muted">{row.revoked_reason ?? "—"}</span>
        ),
    },
  ];

  return (
    <>
      <ListTemplate
        naglowek={{
          title: "Certyfikaty",
          description: "Wydane certyfikaty ukończenia programu i ich unieważnianie.",
          action: meta && <Badge variant="accent">{meta.total} łącznie</Badge>,
        }}
        stan={listaPusta ? "empty" : stan.status}
        httpStatus={stan.status === "error" ? stan.httpStatus : undefined}
        komunikatLadowania="Wczytywanie certyfikatów…"
        komunikatBledu={stan.status === "error" ? stan.message : undefined}
        komunikatBleduTytul=""
        onPonow={ponow}
        pustyTytul="Brak wydanych certyfikatów."
        paginacja={meta ? { strona, ostatniaStrona: meta.last_page, onZmien: ustawStrone } : undefined}
        dodatkowyPanel={success && <Alert variant="success">{success}</Alert>}
      >
        <Table
          columns={columns}
          rows={dane}
          rowKey={(row) => row.id}
          caption="Wydane certyfikaty"
          emptyMessage="Brak wydanych certyfikatów."
        />
      </ListTemplate>

      <ConfirmDialog
        open={revoking !== null}
        title="Unieważnij certyfikat"
        description={revoking ? `Certyfikat ${revoking.number}. Powód jest wymagany.` : undefined}
        confirmLabel="Unieważnij"
        confirmVariant="secondary"
        loading={revoking !== null && pendingId === revoking.id}
        onConfirm={() => void confirmRevoke()}
        onCancel={() => {
          setRevoking(null);
          setActionError(null);
        }}
      >
        {actionError && <Alert variant="error" className="mt-3">{actionError}</Alert>}
        <label className="mt-4 flex flex-col gap-1.5 text-small font-medium text-ink" htmlFor="revoke-reason">
          Powód
          <textarea
            id="revoke-reason"
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-invalid={reasonError ? true : undefined}
            className={`rounded-sm border bg-card px-4 py-2.5 text-body text-ink focus-visible:focus-ring ${reasonError ? "border-danger" : "border-line"}`}
          />
          {reasonError && (
            <span className="text-caption text-danger" role="alert">
              {reasonError}
            </span>
          )}
        </label>
      </ConfirmDialog>
    </>
  );
}
