"use client";

import { useEffect, useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { api, apiPaged, ApiError, type PaginationMeta } from "@/lib/api";
import type { AdminInternshipEntry } from "@/lib/h11/types";

const FORM_LABELS = {
  phone_duty: "Dyżur telefoniczny",
  chat_duty: "Czat",
  other: "Inna forma",
} as const;

export default function AdminInternshipQueue() {
  const [entries, setEntries] = useState<AdminInternshipEntry[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | undefined>();
  const [page, setPage] = useState(1);
  const [loadedPage, setLoadedPage] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [comments, setComments] = useState<Record<number, string>>({});
  const [commentErrors, setCommentErrors] = useState<Record<number, string>>({});
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiPaged<AdminInternshipEntry>(`/admin/internship/pending?page=${page}&per_page=25`)
      .then(({ data, meta: responseMeta }) => {
        if (cancelled) return;
        setEntries(data);
        setMeta(responseMeta);
        setError(null);
        setLoadedPage(page);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof ApiError ? reason.message : "Nie udało się wczytać kolejki.");
        setLoadedPage(page);
      });
    return () => { cancelled = true; };
  }, [page, reload]);

  const loading = loadedPage !== page && error === null;

  async function accept(id: number) {
    setProcessingId(id);
    setSuccess(null);
    try {
      await api<AdminInternshipEntry>(`/admin/internship/${id}/accept`, { method: "POST" });
      setEntries((current) => current.filter((entry) => entry.id !== id));
      setSuccess("Wpis został zaakceptowany.");
    } catch (reason: unknown) {
      setError(reason instanceof ApiError ? reason.message : "Nie udało się zaakceptować wpisu.");
    } finally {
      setProcessingId(null);
    }
  }

  async function returnEntry(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault();
    const comment = comments[id]?.trim() ?? "";
    if (!comment) {
      setCommentErrors((current) => ({ ...current, [id]: "Dodaj komentarz przed odesłaniem wpisu." }));
      return;
    }
    setCommentErrors((current) => ({ ...current, [id]: "" }));
    setProcessingId(id);
    setSuccess(null);
    try {
      await api<AdminInternshipEntry>(`/admin/internship/${id}/return`, { method: "POST", body: { comment } });
      setEntries((current) => current.filter((entry) => entry.id !== id));
      setSuccess("Wpis został odesłany do poprawy.");
    } catch (reason: unknown) {
      if (reason instanceof ApiError && reason.status === 422 && reason.errors?.comment?.[0]) {
        setCommentErrors((current) => ({ ...current, [id]: reason.errors?.comment?.[0] ?? "Nieprawidłowy komentarz." }));
      } else {
        setError(reason instanceof ApiError ? reason.message : "Nie udało się odesłać wpisu.");
      }
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h2 font-black text-ink">Akceptacja stażu</h1>
        <p className="mt-2 text-body text-muted">Sprawdź wpisy oczekujące na decyzję.</p>
      </div>
      {success && <Alert variant="success">{success}</Alert>}
      {error && (
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="secondary" onClick={() => { setError(null); setLoadedPage(null); setReload((value) => value + 1); }}>Spróbuj ponownie</Button>
          </div>
        </Alert>
      )}
      {loading ? (
        <p className="rounded-md border border-line bg-card px-4 py-8 text-center text-body text-subtle" role="status">Wczytywanie kolejki…</p>
      ) : !error && entries.length === 0 ? (
        <Card><p className="text-body text-muted">Brak wpisów oczekujących na decyzję.</p></Card>
      ) : !error ? (
        <div className="flex flex-col gap-4">
          {entries.map((entry) => (
            <Card key={entry.id} title={`${entry.user.first_name} ${entry.user.last_name}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-small text-muted">{entry.date} · {entry.hours} h · {FORM_LABELS[entry.form]}</p>
                  <p className="text-small text-muted">Konsultacji: {entry.consultations_count}</p>
                </div>
                <Badge variant="info">Oczekuje na akceptację</Badge>
              </div>
              {entry.description && <p className="mt-4 whitespace-pre-wrap text-body text-muted">{entry.description}</p>}
              <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4">
                <Button onClick={() => accept(entry.id)} loading={processingId === entry.id} disabled={processingId !== null && processingId !== entry.id}>
                  Akceptuj wpis
                </Button>
                <form className="flex flex-col gap-2" onSubmit={(event) => returnEntry(event, entry.id)}>
                  <label htmlFor={`return-comment-${entry.id}`} className="text-small font-medium text-ink">Komentarz przy odesłaniu</label>
                  <textarea
                    id={`return-comment-${entry.id}`}
                    value={comments[entry.id] ?? ""}
                    onChange={(event) => setComments((current) => ({ ...current, [entry.id]: event.target.value }))}
                    aria-invalid={commentErrors[entry.id] ? true : undefined}
                    aria-describedby={`return-comment-${entry.id}-error`}
                    rows={3}
                    className={`rounded-sm border bg-card px-4 py-2.5 text-body text-ink focus-visible:focus-ring ${commentErrors[entry.id] ? "border-danger" : "border-line"}`}
                  />
                  {commentErrors[entry.id] && <p id={`return-comment-${entry.id}-error`} className="text-caption font-medium text-danger" role="alert">{commentErrors[entry.id]}</p>}
                  <Button type="submit" variant="secondary" loading={processingId === entry.id} disabled={processingId !== null && processingId !== entry.id}>Odeślij do poprawy</Button>
                </form>
              </div>
            </Card>
          ))}
          {meta && meta.last_page > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Poprzednia</Button>
              <span className="text-small text-subtle">Strona {meta.current_page} z {meta.last_page}</span>
              <Button variant="secondary" disabled={page >= meta.last_page} onClick={() => setPage((value) => Math.min(meta.last_page, value + 1))}>Następna</Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
