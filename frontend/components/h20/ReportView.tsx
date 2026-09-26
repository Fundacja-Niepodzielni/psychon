"use client";

import { useEffect, useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Table, { type Column } from "@/components/ui/Table";
import ListTemplate, { type StanListy } from "@/components/templates/ListTemplate";
import {
  ApiError,
  downloadReportCsv,
  fetchReport,
  type ReportData,
  type ReportFilters,
  type ReportPersonRow,
} from "@/lib/api";
import { ROLE_LABELS } from "@/lib/h18/labels";

const EMPTY_FILTERS = { from: "", to: "" };

export default function ReportView() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | undefined>();
  const [reload, setReload] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Pola formularza (co użytkownik wpisuje) vs zastosowane filtry
  // (co poszło do API) — domyślnie oba puste, czyli zachowanie bez zmian.
  const [form, setForm] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState<ReportFilters>({});

  useEffect(() => {
    let active = true;
    fetchReport(applied)
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
  }, [reload, applied]);

  function applyFilters(e: FormEvent) {
    e.preventDefault();
    setApplied({
      from: form.from || undefined,
      to: form.to || undefined,
    });
  }

  async function exportCsv() {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadReportCsv(applied);
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
      key: "stage",
      header: "Etap",
      render: (row) => (
        <Badge variant={row.stage === "certyfikat" ? "success" : "neutral"}>
          {row.stage_label}
        </Badge>
      ),
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

  // Liczby podsumowania nie zależą od listy imiennej (widoczne zawsze, gdy
  // odpowiedź je zawiera) — stan pusty dotyczy wyłącznie tabeli osób, którą
  // pokazuje `Table` przez własny `emptyMessage`, nie cały ekran.
  const stanEfektywny: StanListy = error ? "error" : !report ? "loading" : "success";

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
      komunikatBrakUprawnien="Nie masz uprawnień do wyświetlenia tego raportu."
      onPonow={() => {
        setError(null);
        setErrorStatus(undefined);
        setReload((value) => value + 1);
      }}
      dodatkowyPanel={
        <>
          {downloadError && (
            <Alert variant="error" className="print:hidden">
              {downloadError}
            </Alert>
          )}
          <form
            onSubmit={applyFilters}
            className="grid gap-4 print:hidden sm:grid-cols-[160px_160px_auto] sm:items-end"
          >
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

      {report && report.people.length === 0 && (
        <h2 className="text-h4 font-bold text-ink">Brak osób do zestawienia.</h2>
      )}
      {/* Zdanie zgodne z warunkiem zapytania w ReportSummary.php
          (`whereIn('role', ['volunteer', 'student'])`) —
          lista obejmuje wszystkie konta wolontariuszy i studentów, bez
          warunku ukończenia programu i bez filtra edycji. */}
      <Table
        columns={columns}
        rows={report?.people ?? []}
        rowKey={(row) => row.id}
        caption="Zestawienie imienne"
        emptyMessage="Wiersze pojawią się tutaj, gdy w systemie będą konta wolontariuszy lub studentów."
      />
    </ListTemplate>
  );
}
