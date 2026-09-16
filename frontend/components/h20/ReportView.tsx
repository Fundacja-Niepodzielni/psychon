"use client";

import { useEffect, useState } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Table, { type Column } from "@/components/ui/Table";
import ListTemplate, { type StanListy } from "@/components/templates/ListTemplate";
import {
  ApiError,
  downloadReportCsv,
  fetchReport,
  type ReportData,
  type ReportPersonRow,
} from "@/lib/api";
import { ROLE_LABELS } from "@/lib/h18/labels";

export default function ReportView() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | undefined>();
  const [reload, setReload] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchReport()
      .then((data) => {
        if (active) setReport(data);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Nie udało się wczytać raportu.",
        );
        setErrorStatus(err instanceof ApiError ? err.status : undefined);
      });
    return () => {
      active = false;
    };
  }, [reload]);

  async function exportCsv() {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadReportCsv();
    } catch (err) {
      setDownloadError(
        err instanceof ApiError ? err.message : "Nie udało się pobrać pliku CSV.",
      );
    } finally {
      setDownloading(false);
    }
  }

  const columns: Column<ReportPersonRow>[] = [
    {
      key: "name",
      header: "Osoba",
      render: (row) => `${row.first_name} ${row.last_name}`,
    },
    {
      key: "role",
      header: "Rola",
      render: (row) => ROLE_LABELS[row.role] ?? row.role,
    },
    {
      key: "hours",
      header: "Godziny stażu",
      render: (row) => row.hours_accepted,
    },
    {
      key: "consultations",
      header: "Konsultacje",
      render: (row) => row.consultations,
    },
    {
      key: "certificate",
      header: "Certyfikat",
      render: (row) => (
        <Badge variant={row.certificate_issued ? "success" : "neutral"}>
          {row.certificate_issued ? "Wydany" : "Brak"}
        </Badge>
      ),
    },
  ];

  const stanEfektywny: StanListy = error
    ? "error"
    : !report
      ? "loading"
      : report.people.length === 0
        ? "empty"
        : "success";

  return (
    <ListTemplate
      naglowek={{
        title: "Raport edycji",
        description: "Liczby do grantu — te same źródła co karta osoby i pulpit.",
        action: (
          <>
            <Button variant="secondary" onClick={exportCsv} loading={downloading}>
              Eksport CSV
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              Drukuj
            </Button>
          </>
        ),
        className: "print:hidden",
      }}
      stan={stanEfektywny}
      httpStatus={errorStatus}
      komunikatLadowania="Wczytywanie raportu…"
      komunikatBledu={error ?? undefined}
      onPonow={() => {
        setError(null);
        setErrorStatus(undefined);
        setReload((value) => value + 1);
      }}
      pustyTytul="Brak osób do zestawienia."
      dodatkowyPanel={
        downloadError && (
          <Alert variant="error" className="print:hidden">
            {downloadError}
          </Alert>
        )
      }
    >
      <h1 className="hidden text-h3 font-black text-ink print:block">
        Raport edycji — Fundacja Niepodzielni
      </h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-caption font-bold uppercase tracking-wide text-subtle">
            Osoby przyjęte
          </p>
          <p className="mt-1 text-h3 font-black text-ink">{report?.summary.admitted}</p>
        </Card>
        <Card>
          <p className="text-caption font-bold uppercase tracking-wide text-subtle">
            Osoby aktywne
          </p>
          <p className="mt-1 text-h3 font-black text-ink">{report?.summary.active}</p>
        </Card>
        <Card>
          <p className="text-caption font-bold uppercase tracking-wide text-subtle">
            Programy ukończone
          </p>
          <p className="mt-1 text-h3 font-black text-ink">{report?.summary.completed}</p>
        </Card>
        <Card>
          <p className="text-caption font-bold uppercase tracking-wide text-subtle">
            Certyfikaty wydane
          </p>
          <p className="mt-1 text-h3 font-black text-ink">
            {report?.summary.certificates_issued}
          </p>
        </Card>
      </div>

      <Card title="Pozostałe liczby">
        <dl className="grid gap-4 text-small sm:grid-cols-3">
          <div>
            <dt className="text-muted">Suma godzin stażu</dt>
            <dd className="mt-1 font-bold text-ink">{report?.summary.hours_accepted_total}</dd>
          </div>
          <div>
            <dt className="text-muted">Średnia godzin / osobę</dt>
            <dd className="mt-1 font-bold text-ink">{report?.summary.hours_accepted_average}</dd>
          </div>
          <div>
            <dt className="text-muted">Konsultacje łącznie</dt>
            <dd className="mt-1 font-bold text-ink">{report?.summary.consultations_total}</dd>
          </div>
        </dl>
      </Card>

      <Table
        columns={columns}
        rows={report?.people ?? []}
        rowKey={(row) => row.id}
        caption="Zestawienie imienne"
        emptyMessage="Brak osób do zestawienia."
      />
    </ListTemplate>
  );
}
