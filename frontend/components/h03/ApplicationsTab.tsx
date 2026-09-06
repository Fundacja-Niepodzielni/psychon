"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Table, { type Column } from "@/components/ui/Table";
import { api, apiPaged, ApiError, downloadFile, type PaginationMeta } from "@/lib/api";
import type { ApplicationItem, ApplicationRole, ApplicationStatus, CapacityReason } from "@/lib/h03/types";

export interface ApplicationsTabProps {
  className?: string;
}

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  new: "Nowe",
  accepted: "Zaakceptowane",
  rejected: "Odrzucone",
};

const ROLE_LABELS: Record<ApplicationRole, string> = {
  super_admin: "Super Admin",
  project_manager: "Opiekun Projektu",
  instructor: "Prowadzący",
  volunteer: "Wolontariusz",
  student: "Student",
};

const STATUS_VARIANTS: Record<ApplicationStatus, "info" | "success" | "danger"> = {
  new: "info",
  accepted: "success",
  rejected: "danger",
};

function apiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  return `${raw.replace(/\/+$/, "")}/api/v1`;
}

function dateLabel(value: string | null): string {
  return value ? new Date(value).toLocaleString("pl-PL") : "—";
}

export function ApplicationsTab({ className = "" }: ApplicationsTabProps) {
  const [items, setItems] = useState<ApplicationItem[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ApplicationStatus | "">("");
  const [search, setSearch] = useState("");
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [selected, setSelected] = useState<ApplicationItem | null>(null);
  const [accepting, setAccepting] = useState<ApplicationItem | null>(null);
  const [acceptRole, setAcceptRole] = useState<ApplicationRole>("volunteer");
  const [capacityPrompt, setCapacityPrompt] = useState<CapacityReason | null>(null);
  const [capacityApplication, setCapacityApplication] = useState<ApplicationItem | null>(null);
  const [rejecting, setRejecting] = useState<ApplicationItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createValues, setCreateValues] = useState({ first_name: "", last_name: "", email: "", phone: "" });
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [importReport, setImportReport] = useState<{ imported: number; skipped: Array<{ line: number; reason: string }> } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const queryKey = `${page}|${status}|${search}|${reload}`;
  const loading = loadedKey !== queryKey && error === null;

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), per_page: "25", sort: "-created_at" });
    if (status) params.set("status", status);
    if (search.trim()) params.set("search", search.trim());

    apiPaged<ApplicationItem>(`/admin/applications?${params.toString()}`)
      .then((response) => {
        if (cancelled) return;
        setItems(response.data);
        setMeta(response.meta);
        setError(null);
        setLoadedKey(queryKey);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof ApiError ? reason.message : "Nie udało się wczytać zgłoszeń.");
        setLoadedKey(queryKey);
      });
    return () => { cancelled = true; };
  }, [page, reload, search, status, queryKey]);

  useEffect(() => {
    if (selected || accepting || rejecting || capacityPrompt) dialogRef.current?.focus();
  }, [selected, accepting, rejecting, capacityPrompt]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setSelected(null);
      setAccepting(null);
      setRejecting(null);
      setCapacityPrompt(null);
      setCapacityApplication(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const refresh = () => {
    setLoadedKey(null);
    setReload((value) => value + 1);
  };

  const columns = useMemo<Column<ApplicationItem>[]>(() => [
    {
      key: "candidate",
      header: "Kandydatka / kandydat",
      render: (row) => (
        <button type="button" className="text-left font-medium text-primary underline-offset-2 hover:underline focus-visible:focus-ring" onClick={() => setSelected(row)}>
          <span className="block text-ink">{row.first_name} {row.last_name}</span>
          <span className="block text-caption text-muted">{row.email}</span>
        </button>
      ),
    },
    { key: "role", header: "Rola", render: (row) => ROLE_LABELS[row.role] },
    { key: "status", header: "Status", render: (row) => <Badge variant={STATUS_VARIANTS[row.status]}>{STATUS_LABELS[row.status]}</Badge> },
    { key: "created", header: "Dodano", render: (row) => dateLabel(row.created_at) },
    {
      key: "actions",
      header: "Akcje",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {row.status === "new" && <Button className="min-h-11" onClick={() => { setAccepting(row); setAcceptRole(row.role === "super_admin" ? "volunteer" : row.role); }} disabled={pendingId !== null}>Akceptuj</Button>}
          {row.status === "new" && <Button variant="secondary" className="min-h-11" onClick={() => { setRejecting(row); setRejectReason(""); setRejectError(null); }} disabled={pendingId !== null}>Odrzuć</Button>}
        </div>
      ),
    },
  ], [pendingId]);

  async function createApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateErrors({});
    setPendingId(-1);
    try {
      await api<ApplicationItem>("/admin/applications", { method: "POST", body: createValues });
      setCreateValues({ first_name: "", last_name: "", email: "", phone: "" });
      setCreateOpen(false);
      setSuccess("Zgłoszenie zostało dodane.");
      refresh();
    } catch (reason: unknown) {
      if (reason instanceof ApiError && reason.status === 422 && reason.errors) {
        setCreateErrors(Object.fromEntries(Object.entries(reason.errors).map(([key, values]) => [key, values[0] ?? "Nieprawidłowa wartość."])));
      } else {
        setError(reason instanceof ApiError ? reason.message : "Nie udało się dodać zgłoszenia.");
      }
    } finally {
      setPendingId(null);
    }
  }

  async function acceptApplication(application: ApplicationItem, force = false) {
    setPendingId(application.id);
    setError(null);
    try {
      await api<{ user_id: number; access_expires_at: string }>(`/admin/applications/${application.id}/accept`, { method: "POST", body: { role: acceptRole, ...(force ? { force: true } : {}) } });
      setAccepting(null);
      setCapacityPrompt(null);
      setCapacityApplication(null);
      setSuccess("Zgłoszenie zaakceptowano i wysłano zaproszenie.");
      refresh();
    } catch (reason: unknown) {
      if (!force && reason instanceof ApiError && reason.status === 409 && reason.code === "edition_capacity_exceeded") {
        setCapacityPrompt((reason.reason ?? {}) as unknown as CapacityReason);
        setCapacityApplication(application);
        setAccepting(null);
      } else {
        setError(reason instanceof ApiError ? reason.message : "Nie udało się zaakceptować zgłoszenia.");
      }
    } finally {
      setPendingId(null);
    }
  }

  async function rejectApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = rejectReason.trim();
    if (!reason) {
      setRejectError("Podaj powód odrzucenia.");
      return;
    }
    if (!rejecting) return;
    setPendingId(rejecting.id);
    setRejectError(null);
    try {
      await api<ApplicationItem>(`/admin/applications/${rejecting.id}/reject`, { method: "POST", body: { reason } });
      setRejecting(null);
      setSuccess("Zgłoszenie odrzucono.");
      refresh();
    } catch (reasonError: unknown) {
      if (reasonError instanceof ApiError && reasonError.errors?.reason?.[0]) setRejectError(reasonError.errors.reason[0]);
      else setError(reasonError instanceof ApiError ? reasonError.message : "Nie udało się odrzucić zgłoszenia.");
    } finally {
      setPendingId(null);
    }
  }

  async function importApplications(file: File) {
    const body = new FormData();
    body.append("file", file);
    setPendingId(-2);
    setImportReport(null);
    try {
      const report = await api<{ imported: number; skipped: Array<{ line: number; reason: string }> }>("/admin/applications/import", { method: "POST", body });
      setImportReport(report);
      setSuccess("Import został zakończony.");
      refresh();
    } catch (reason: unknown) {
      setError(reason instanceof ApiError ? reason.message : "Nie udało się zaimportować pliku.");
    } finally {
      setPendingId(null);
    }
  }

  function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void importApplications(file);
  }

  return (
    <div className={`flex flex-col gap-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-h2 font-black text-ink">Zgłoszenia</h2><p className="mt-1 text-body text-muted">Kolejka rekrutacyjna aktywnej edycji.</p></div><Button onClick={() => setCreateOpen((value) => !value)}>{createOpen ? "Zamknij formularz" : "Dodaj zgłoszenie"}</Button></div>
      {success && <Alert variant="success">{success}</Alert>}
      {error && <Alert variant="error"><div className="flex flex-wrap items-center justify-between gap-3"><span>{error}</span><Button variant="secondary" onClick={() => { setError(null); refresh(); }}>Spróbuj ponownie</Button></div></Alert>}

      {createOpen && <Card title="Nowe zgłoszenie"><form className="grid gap-4 md:grid-cols-2" onSubmit={createApplication}><Input label="Imię" value={createValues.first_name} onChange={(event) => setCreateValues((current) => ({ ...current, first_name: event.target.value }))} error={createErrors.first_name} required /><Input label="Nazwisko" value={createValues.last_name} onChange={(event) => setCreateValues((current) => ({ ...current, last_name: event.target.value }))} error={createErrors.last_name} required /><Input label="E-mail" type="email" value={createValues.email} onChange={(event) => setCreateValues((current) => ({ ...current, email: event.target.value }))} error={createErrors.email} required /><Input label="Telefon" value={createValues.phone} onChange={(event) => setCreateValues((current) => ({ ...current, phone: event.target.value }))} error={createErrors.phone} /><div className="md:col-span-2"><Button type="submit" loading={pendingId === -1}>Zapisz zgłoszenie</Button></div></form></Card>}

      <Card title="Filtry"><div className="grid gap-4 md:grid-cols-[1fr_220px_auto]"><Input label="Szukaj" value={search} onChange={(event) => { setPage(1); setLoadedKey(null); setSearch(event.target.value); }} placeholder="Imię, nazwisko lub e-mail" /><Select label="Status" value={status} onChange={(event) => { setPage(1); setLoadedKey(null); setStatus(event.target.value as ApplicationStatus | ""); }}><option value="">Wszystkie</option><option value="new">Nowe</option><option value="accepted">Zaakceptowane</option><option value="rejected">Odrzucone</option></Select><label className="flex min-h-11 cursor-pointer items-center justify-center self-end rounded-pill border border-primary px-4 text-small font-medium text-primary hover:bg-brand-10"><span>{pendingId === -2 ? "Importowanie…" : "Import CSV"}</span><input className="sr-only" type="file" accept=".csv,text/csv" onChange={handleImport} disabled={pendingId !== null} /></label></div></Card>

      {importReport && <Alert variant="info" title="Raport importu"><p>Zaimportowano: {importReport.imported}.</p>{importReport.skipped.length > 0 && <ul className="mt-2 list-disc pl-5">{importReport.skipped.map((row) => <li key={`${row.line}-${row.reason}`}>Wiersz {row.line}: {row.reason}</li>)}</ul>}</Alert>}
      {loading ? <p className="rounded-md border border-line bg-card px-4 py-8 text-center text-body text-subtle" role="status">Wczytywanie zgłoszeń…</p> : !error && <Table columns={columns} rows={items} rowKey={(row) => row.id} caption="Kolejka zgłoszeń rekrutacyjnych" emptyMessage="Brak zgłoszeń spełniających filtry." />}
      {meta && meta.last_page > 1 && <div className="flex items-center justify-center gap-3"><Button variant="secondary" disabled={page <= 1} onClick={() => { setPage((value) => Math.max(1, value - 1)); setLoadedKey(null); }}>Poprzednia</Button><span className="text-small text-subtle">Strona {meta.current_page} z {meta.last_page}</span><Button variant="secondary" disabled={page >= meta.last_page} onClick={() => { setPage((value) => Math.min(meta.last_page, value + 1)); setLoadedKey(null); }}>Następna</Button></div>}

      {selected && <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="application-details-title" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setSelected(null)}><div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-md border border-line bg-card p-6 shadow-card" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><h2 id="application-details-title" className="text-h3 font-black text-ink">Szczegóły zgłoszenia</h2><Button variant="ghost" aria-label="Zamknij szczegóły" onClick={() => setSelected(null)}>✕</Button></div><dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-small"><dt className="font-bold text-muted">Osoba</dt><dd>{selected.first_name} {selected.last_name}</dd><dt className="font-bold text-muted">E-mail</dt><dd>{selected.email}</dd><dt className="font-bold text-muted">Telefon</dt><dd>{selected.phone ?? "—"}</dd><dt className="font-bold text-muted">Uczelnia</dt><dd>{selected.university ?? "—"}</dd><dt className="font-bold text-muted">Status</dt><dd><Badge variant={STATUS_VARIANTS[selected.status]}>{STATUS_LABELS[selected.status]}</Badge></dd><dt className="font-bold text-muted">Dodano</dt><dd>{dateLabel(selected.created_at)}</dd></dl>{selected.has_diploma_scan && <Button className="mt-5 min-h-11" variant="secondary" onClick={() => void downloadFile(`${apiBase()}/admin/applications/${selected.id}/diploma-scan`, `skan-dyplomu-${selected.id}.pdf`)}>Otwórz skan dyplomu</Button>}</div></div>}
      {accepting && <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="accept-application-title" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setAccepting(null)}><form className="w-full max-w-md rounded-md border border-line bg-card p-6 shadow-card" onSubmit={(event) => { event.preventDefault(); void acceptApplication(accepting); }} onClick={(event) => event.stopPropagation()}><h2 id="accept-application-title" className="text-h3 font-black text-ink">Akceptuj zgłoszenie</h2><p className="mt-2 text-body text-muted">{accepting.first_name} {accepting.last_name}</p><Select className="mt-4" label="Rola konta" value={acceptRole} onChange={(event) => setAcceptRole(event.target.value as ApplicationRole)}><option value="volunteer">Wolontariusz</option><option value="student">Student</option><option value="instructor">Prowadzący</option><option value="project_manager">Opiekun Projektu</option></Select><div className="mt-5 flex gap-3"><Button type="submit" loading={pendingId === accepting.id}>Akceptuj i wyślij zaproszenie</Button><Button type="button" variant="secondary" onClick={() => setAccepting(null)}>Anuluj</Button></div></form></div>}
      {rejecting && <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="reject-application-title" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setRejecting(null)}><form className="w-full max-w-md rounded-md border border-line bg-card p-6 shadow-card" onSubmit={rejectApplication} onClick={(event) => event.stopPropagation()}><h2 id="reject-application-title" className="text-h3 font-black text-ink">Odrzuć zgłoszenie</h2><p className="mt-2 text-body text-muted">Powód jest wymagany.</p><label className="mt-4 flex flex-col gap-1.5 text-small font-medium text-ink" htmlFor="reject-reason">Powód<textarea id="reject-reason" rows={4} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} aria-invalid={rejectError ? true : undefined} className={`rounded-sm border bg-card px-4 py-2.5 text-body text-ink focus-visible:focus-ring ${rejectError ? "border-danger" : "border-line"}`} />{rejectError && <span className="text-caption text-danger" role="alert">{rejectError}</span>}</label><div className="mt-5 flex gap-3"><Button type="submit" loading={pendingId === rejecting.id}>Odrzuć</Button><Button type="button" variant="secondary" onClick={() => setRejecting(null)}>Anuluj</Button></div></form></div>}
      {capacityPrompt && capacityApplication && <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="capacity-title" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"><div className="w-full max-w-md rounded-md border border-line bg-card p-6 shadow-card"><h2 id="capacity-title" className="text-h3 font-black text-ink">Brak wolnych miejsc</h2><p className="mt-3 text-body text-muted">Limit: {capacityPrompt.capacity}. Aktywnych: {capacityPrompt.active}. Wnioskowanych: {capacityPrompt.requested}.</p><p className="mt-2 text-small text-muted">Czy świadomie zaakceptować ponad limit?</p><div className="mt-5 flex gap-3"><Button loading={pendingId === capacityApplication.id} onClick={() => void acceptApplication(capacityApplication, true)}>Potwierdź force</Button><Button variant="secondary" onClick={() => { setCapacityPrompt(null); setCapacityApplication(null); }}>Anuluj</Button></div></div></div>}
    </div>
  );
}

export default ApplicationsTab;
