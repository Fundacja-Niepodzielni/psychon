"use client";

import { useCallback, useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ListTemplate, { type StanListy } from "@/components/templates/ListTemplate";
import { useZasobStronicowany } from "@/lib/hooks/useZasobStronicowany";
import { api, apiPaged, ApiError } from "@/lib/api";
import type { AdminInternshipEntry } from "@/lib/h11/types";

const FORM_LABELS = {
  phone_duty: "Dyżur telefoniczny",
  chat_duty: "Czat",
  other: "Inna forma",
} as const;

/**
 * Kolejka akceptacji stażu (H11), na `ListTemplate` (C2 wariant C).
 * Przyjęcie/odesłanie wpisu usuwa go z widoku bez ponownego pobrania strony
 * (`wykluczeni`) — dokładnie tak jak przed przepięciem. Błąd akcji dzieli
 * jeden komunikat z błędem listy (jak w oryginale): „Spróbuj ponownie" zawsze
 * odpytuje serwer od nowa, więc oba idą przez `ponow()` z haka. 403 na samej
 * liście → `forbidden` idzie przez `httpStatus` i `ListTemplate` (jeden
 * mechanizm); błąd akcji nigdy nie niesie `httpStatus`, więc nie da się z nim
 * pomylić.
 */
export default function AdminInternshipQueue() {
  const [wykluczeni, setWykluczeni] = useState<Set<number>>(new Set());
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [comments, setComments] = useState<Record<number, string>>({});
  const [commentErrors, setCommentErrors] = useState<Record<number, string>>({});
  const [success, setSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const pobierz = useCallback(
    (strona: number) =>
      apiPaged<AdminInternshipEntry>(`/admin/internship/pending?page=${strona}&per_page=25`),
    [],
  );

  const { stan, meta, strona, ustawStrone, ponow } = useZasobStronicowany<AdminInternshipEntry>(
    pobierz,
    [],
    "Nie udało się wczytać kolejki.",
  );

  const entries =
    stan.status === "success" ? stan.data.filter((entry) => !wykluczeni.has(entry.id)) : [];
  const listaPusta = stan.status === "success" && entries.length === 0;

  const stanEfektywny: StanListy =
    stan.status === "loading"
      ? "loading"
      : stan.status === "error" || actionError
        ? "error"
        : listaPusta
          ? "empty"
          : "success";

  const httpStatus = stan.status === "error" ? stan.httpStatus : undefined;
  const komunikatBledu = stan.status === "error" ? stan.message : actionError ?? undefined;

  function ponowWszystko() {
    setActionError(null);
    ponow();
  }

  async function accept(id: number) {
    setProcessingId(id);
    setSuccess(null);
    setActionError(null);
    try {
      await api<AdminInternshipEntry>(`/admin/internship/${id}/accept`, { method: "POST" });
      setWykluczeni((current) => new Set(current).add(id));
      setSuccess("Wpis został zaakceptowany.");
    } catch (reason: unknown) {
      setActionError(
        reason instanceof ApiError ? reason.message : "Nie udało się zaakceptować wpisu.",
      );
    } finally {
      setProcessingId(null);
    }
  }

  async function returnEntry(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault();
    const comment = comments[id]?.trim() ?? "";
    if (!comment) {
      setCommentErrors((current) => ({
        ...current,
        [id]: "Dodaj komentarz przed odesłaniem wpisu.",
      }));
      return;
    }
    setCommentErrors((current) => ({ ...current, [id]: "" }));
    setProcessingId(id);
    setSuccess(null);
    setActionError(null);
    try {
      await api<AdminInternshipEntry>(`/admin/internship/${id}/return`, {
        method: "POST",
        body: { comment },
      });
      setWykluczeni((current) => new Set(current).add(id));
      setSuccess("Wpis został odesłany do poprawy.");
    } catch (reason: unknown) {
      if (reason instanceof ApiError && reason.status === 422 && reason.errors?.comment?.[0]) {
        setCommentErrors((current) => ({
          ...current,
          [id]: reason.errors?.comment?.[0] ?? "Nieprawidłowy komentarz.",
        }));
      } else {
        setActionError(
          reason instanceof ApiError ? reason.message : "Nie udało się odesłać wpisu.",
        );
      }
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <ListTemplate
      naglowek={{
        title: "Akceptacja stażu",
        description: "Sprawdź wpisy oczekujące na decyzję.",
      }}
      stan={stanEfektywny}
      httpStatus={httpStatus}
      komunikatLadowania="Wczytywanie kolejki…"
      komunikatBledu={komunikatBledu}
      komunikatBleduTytul=""
      onPonow={ponowWszystko}
      pustyTytul="Brak wpisów oczekujących na decyzję."
      paginacja={
        meta ? { strona, ostatniaStrona: meta.last_page, onZmien: ustawStrone } : undefined
      }
      dodatkowyPanel={success && <Alert variant="success">{success}</Alert>}
    >
      <div className="flex flex-col gap-4">
        {entries.map((entry) => (
          <Card key={entry.id} title={`${entry.user.first_name} ${entry.user.last_name}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-small text-muted">
                  {entry.date} · {entry.hours} h · {FORM_LABELS[entry.form]}
                </p>
                <p className="text-small text-muted">
                  Konsultacji: {entry.consultations_count}
                </p>
              </div>
              <Badge variant="info">Oczekuje na akceptację</Badge>
            </div>
            {entry.description && (
              <p className="mt-4 whitespace-pre-wrap text-body text-muted">
                {entry.description}
              </p>
            )}
            <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4">
              <Button
                onClick={() => accept(entry.id)}
                loading={processingId === entry.id}
                disabled={processingId !== null && processingId !== entry.id}
              >
                Akceptuj wpis
              </Button>
              <form
                className="flex flex-col gap-2"
                onSubmit={(event) => returnEntry(event, entry.id)}
              >
                <label
                  htmlFor={`return-comment-${entry.id}`}
                  className="text-small font-medium text-ink"
                >
                  Komentarz przy odesłaniu
                </label>
                <textarea
                  id={`return-comment-${entry.id}`}
                  value={comments[entry.id] ?? ""}
                  onChange={(event) =>
                    setComments((current) => ({ ...current, [entry.id]: event.target.value }))
                  }
                  aria-invalid={commentErrors[entry.id] ? true : undefined}
                  aria-describedby={`return-comment-${entry.id}-error`}
                  rows={3}
                  className={`rounded-sm border bg-card px-4 py-2.5 text-body text-ink focus-visible:focus-ring ${
                    commentErrors[entry.id] ? "border-danger" : "border-line"
                  }`}
                />
                {commentErrors[entry.id] && (
                  <p
                    id={`return-comment-${entry.id}-error`}
                    className="text-caption font-medium text-danger"
                    role="alert"
                  >
                    {commentErrors[entry.id]}
                  </p>
                )}
                <Button
                  type="submit"
                  variant="secondary"
                  loading={processingId === entry.id}
                  disabled={processingId !== null && processingId !== entry.id}
                >
                  Odeślij do poprawy
                </Button>
              </form>
            </div>
          </Card>
        ))}
      </div>
    </ListTemplate>
  );
}
