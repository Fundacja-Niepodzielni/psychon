"use client";

import { useEffect, useState } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Table, { type Column } from "@/components/ui/Table";
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
      });
    return () => {
      active = false;
    };
  }, []);

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-h2 font-black text-ink">Raport edycji</h1>
          <p className="mt-2 text-body text-muted">
            Liczby do grantu — te same źródła co karta osoby i pulpit.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={exportCsv} loading={downloading}>
            Eksport CSV
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            Drukuj
          </Button>
        </div>
      </div>

      {downloadError && <Alert variant="error" className="print:hidden">{downloadError}</Alert>}

      {error ? (
        <Alert variant="error">{error}</Alert>
      ) : !report ? (
        <p role="status" className="text-body text-muted">
          Wczytywanie raportu…
        </p>
      ) : (
        <>
          <h1 className="hidden text-h3 font-black text-ink print:block">
            Raport edycji — Fundacja Niepodzielni
          </h1>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <p className="text-caption font-bold uppercase tracking-wide text-subtle">
                Osoby przyjęte
              </p>
              <p className="mt-1 text-h3 font-black text-ink">{report.summary.admitted}</p>
            </Card>
            <Card>
              <p className="text-caption font-bold uppercase tracking-wide text-subtle">
                Osoby aktywne
              </p>
              <p className="mt-1 text-h3 font-black text-ink">{report.summary.active}</p>
            </Card>
            <Card>
              <p className="text-caption font-bold uppercase tracking-wide text-subtle">
                Programy ukończone
              </p>
              <p className="mt-1 text-h3 font-black text-ink">{report.summary.completed}</p>
            </Card>
            <Card>
              <p className="text-caption font-bold uppercase tracking-wide text-subtle">
                Certyfikaty wydane
              </p>
              <p className="mt-1 text-h3 font-black text-ink">
                {report.summary.certificates_issued}
              </p>
            </Card>
            <Card>
              <p className="text-caption font-bold uppercase tracking-wide text-subtle">
                Suma godzin stażu
              </p>
              <p className="mt-1 text-h3 font-black text-ink">
                {report.summary.hours_accepted_total}
              </p>
            </Card>
            <Card>
              <p className="text-caption font-bold uppercase tracking-wide text-subtle">
                Średnia godzin / osobę
              </p>
              <p className="mt-1 text-h3 font-black text-ink">
                {report.summary.hours_accepted_average}
              </p>
            </Card>
            <Card>
              <p className="text-caption font-bold uppercase tracking-wide text-subtle">
                Konsultacje łącznie
              </p>
              <p className="mt-1 text-h3 font-black text-ink">
                {report.summary.consultations_total}
              </p>
            </Card>
          </div>

          <Table
            columns={columns}
            rows={report.people}
            rowKey={(row) => row.id}
            caption="Zestawienie imienne"
            emptyMessage="Brak osób do zestawienia."
          />
        </>
      )}
    </div>
  );
}
