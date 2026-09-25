"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Table, { type Column } from "@/components/ui/Table";
import ListTemplate, { type StanListy } from "@/components/templates/ListTemplate";
import { ApiError, downloadReportCsv } from "@/lib/api";
import {
  fetchReports,
  type ReportsData,
  type ReportsFilters,
  type ReportsPersonRow,
} from "@/lib/api/raport";
import { adresListyOsob, ODNOSNIKI_LICZB, type KluczLiczby } from "@/lib/h20/raportOdnosniki";
import { kolumnyOsoby } from "@/components/h20/kolumny-osoby";

const EMPTY_FILTERS = { from: "", to: "" };

/** Kafelek podsumowania z odnośnikiem do listy osób, z której liczba pochodzi. */
function KafelekLiczby({ tytul, klucz, wartosc }: { tytul: string; klucz: KluczLiczby; wartosc: number | undefined }) {
  return (
    <Card>
      <p className="text-caption font-bold uppercase tracking-wide text-subtle">{tytul}</p>
      <p className="mt-1 text-h3 font-black text-ink">
        <Link
          href={adresListyOsob(klucz)}
          className="underline decoration-control underline-offset-4 transition-colors duration-150 hover:decoration-heading focus-visible:focus-ring"
          title={`${ODNOSNIKI_LICZB[klucz].etykieta} — lista osób`}
        >
          {wartosc}
        </Link>
      </p>
    </Card>
  );
}

export default function ReportView() {
  const [report, setReport] = useState<ReportsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | undefined>();
  const [reload, setReload] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Pola formularza (co użytkownik wpisuje) vs zastosowane filtry
  // (co poszło do API) — domyślnie oba puste, czyli zachowanie bez zmian.
  const [form, setForm] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState<ReportsFilters>({});

  useEffect(() => {
    let active = true;
    fetchReports(applied)
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

  // Eksport CSV zostaje na dotychczasowym `GET /admin/report/export.csv`
  // (pakiet H20, `lib/api/h20.ts`) — osobna trasa, niezależna od nowego
  // `GET /admin/reports` użytego przez ten ekran do wyświetlania liczb.
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

  const columns: Column<ReportsPersonRow>[] = [
    ...kolumnyOsoby<ReportsPersonRow>(),
    {
      // Zaliczone testy jako osobna liczba — nie zwinięte w etap (★ kryterium).
      key: "tests_passed",
      header: "Zaliczone testy",
      render: (row) => row.tests_passed,
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
        description: "Liczby do grantu — każda liczba prowadzi do listy osób, z której pochodzi.",
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KafelekLiczby tytul="Osoby przyjęte" klucz="admitted" wartosc={report?.summary.admitted} />
        <KafelekLiczby tytul="Osoby aktywne" klucz="active" wartosc={report?.summary.active} />
        <KafelekLiczby tytul="Programy ukończone" klucz="completed" wartosc={report?.summary.completed} />
        <KafelekLiczby
          tytul="Certyfikaty wydane"
          klucz="certificates_issued"
          wartosc={report?.summary.certificates_issued}
        />
        <KafelekLiczby
          tytul="Zaliczone testy"
          klucz="tests_passed"
          wartosc={report?.summary.tests_passed}
        />
      </div>

      <Card title="Pozostałe liczby">
        {/* Sumy, nie liczba osób — bez odnośnika (patrz komentarz w
            `lib/h20/raportOdnosniki.ts`: filtr listy osób nie odda sumy). */}
        <dl className="grid gap-4 text-small sm:grid-cols-2">
          <div>
            <dt className="text-muted">Suma godzin stażu</dt>
            <dd className="mt-1 font-bold text-ink">{report?.summary.hours_accepted_total}</dd>
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
      {/* Zdanie zgodne z warunkiem zapytania w ReportSummary.php:71-72 —
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
