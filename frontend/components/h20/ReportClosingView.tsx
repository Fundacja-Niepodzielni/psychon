"use client";

import { useEffect, useState, type FormEvent } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Table, { type Column } from "@/components/ui/Table";
import ListTemplate, { type StanListy } from "@/components/templates/ListTemplate";
import { api, ApiError } from "@/lib/api";
import {
  fetchClosingReport,
  type ClosingReportData,
  type ClosingReportPersonRow,
} from "@/lib/api/raport";
import { kolumnyOsoby } from "@/components/h20/kolumny-osoby";

/**
 * `GET /admin/edition` już istnieje (H19, ekran ustawień edycji) — domyślna
 * edycja raportu zamknięcia to edycja aktywna, bez nowej trasy zaplecza.
 * Pole numeru edycji zostaje edytowalne, żeby dało się obejrzeć zamknięcie
 * wcześniejszej edycji.
 */
interface AktywnaEdycja {
  id: number;
}

export default function ReportClosingView() {
  const [editionId, setEditionId] = useState<number | null>(null);
  const [editionInput, setEditionInput] = useState("");
  const [report, setReport] = useState<ClosingReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | undefined>();
  const [reload, setReload] = useState(0);

  // Domyślna edycja — aktywna, pobrana raz przy wejściu na zakładkę.
  useEffect(() => {
    let active = true;
    api<AktywnaEdycja>("/admin/edition")
      .then((edycja) => {
        if (active) {
          setEditionId(edycja.id);
          setEditionInput(String(edycja.id));
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "Nie udało się ustalić aktywnej edycji.",
        );
        setErrorStatus(err instanceof ApiError ? err.status : undefined);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (editionId === null) return;
    let active = true;
    fetchClosingReport(editionId)
      .then((data) => {
        if (active) setReport(data);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "Nie udało się wczytać raportu zamknięcia edycji.",
        );
        setErrorStatus(err instanceof ApiError ? err.status : undefined);
      });
    return () => {
      active = false;
    };
  }, [editionId, reload]);

  function wybierzEdycje(e: FormEvent) {
    e.preventDefault();
    const wartosc = Number(editionInput);
    if (Number.isFinite(wartosc) && wartosc > 0) {
      setReport(null);
      setEditionId(wartosc);
    }
  }

  const columns: Column<ClosingReportPersonRow>[] = [
    ...kolumnyOsoby<ClosingReportPersonRow>(),
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

  const stanEfektywny: StanListy = error ? "error" : !report ? "loading" : "success";

  return (
    <ListTemplate
      naglowek={{
        title: "Raport zamknięcia edycji",
        description: "Stan osób na koniec wskazanej edycji.",
      }}
      stan={stanEfektywny}
      httpStatus={errorStatus}
      komunikatLadowania="Wczytywanie raportu zamknięcia edycji…"
      komunikatBledu={error ?? undefined}
      komunikatBrakUprawnien="Nie masz uprawnień do wyświetlenia tego raportu."
      onPonow={() => {
        setError(null);
        setErrorStatus(undefined);
        setReload((value) => value + 1);
      }}
      dodatkowyPanel={
        <form
          onSubmit={wybierzEdycje}
          className="grid gap-4 sm:grid-cols-[160px_auto] sm:items-end"
        >
          <Input
            label="Numer edycji"
            type="number"
            min={1}
            value={editionInput}
            onChange={(e) => setEditionInput(e.target.value)}
          />
          <Button type="submit">Pokaż</Button>
        </form>
      }
    >
      {report && (
        <>
          <h2 className="text-h4 font-bold text-ink">{report.edition.name}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-caption font-bold uppercase tracking-wide text-subtle">Osoby</p>
              <p className="mt-1 text-h3 font-black text-ink">{report.summary.total}</p>
            </Card>
            <Card>
              <p className="text-caption font-bold uppercase tracking-wide text-subtle">
                Certyfikat wydany
              </p>
              <p className="mt-1 text-h3 font-black text-ink">{report.summary.certified}</p>
            </Card>
            <Card>
              <p className="text-caption font-bold uppercase tracking-wide text-subtle">
                Bez certyfikatu
              </p>
              <p className="mt-1 text-h3 font-black text-ink">{report.summary.not_certified}</p>
            </Card>
          </div>
        </>
      )}
      <Table
        columns={columns}
        rows={report?.people ?? []}
        rowKey={(row) => row.id}
        caption="Osoby na zamknięcie edycji"
        emptyMessage="Wiersze pojawią się tutaj, gdy edycja będzie miała osoby do zestawienia."
      />
    </ListTemplate>
  );
}
