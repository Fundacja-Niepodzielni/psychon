"use client";

import { useEffect, useState } from "react";
import QuestionForm from "@/components/h10/QuestionForm";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { api, ApiError } from "@/lib/api";
import {
  draftError,
  draftFrom,
  emptyDraft,
  type QuestionDraft,
  type TestQuestion,
} from "@/lib/h10/types";

export interface QuestionBankProps {
  /** Identyfikator testu (`tests.id`), nie kursu. */
  testId: number;
}

type Phase = "loading" | "ready" | "load_error";

function fieldErrorsOf(error: unknown): Record<string, string[]> {
  return error instanceof ApiError ? (error.errors ?? {}) : {};
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * Bank pytań testu (H10, kryterium 6) — pełny CRUD w panelu opiekuna.
 *
 * Edycja i usunięcie NIE ruszają historii podejść: każde podejście trzyma
 * własny `questions_snapshot` po stronie serwera (kryteria 3 i 6). Dlatego
 * ekran nie ostrzega, że zmiana wpłynie na wyniki — bo nie wpływa.
 *
 * Kolejność pytań pokazujemy z `sequence_order` nadanego przez serwer; panel
 * jej nie przestawia (`PATCH` przyjmuje to pole, ale zmiana kolejności to
 * osobna pozycja — bez niej przeciąganie wierszy obiecywałoby więcej, niż robi).
 */
export default function QuestionBank({ testId }: QuestionBankProps) {
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newDraft, setNewDraft] = useState<QuestionDraft>(emptyDraft);
  const [newError, setNewError] = useState<string | null>(null);
  const [newFieldErrors, setNewFieldErrors] = useState<Record<string, string[]>>(
    {},
  );

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<QuestionDraft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editFieldErrors, setEditFieldErrors] = useState<
    Record<string, string[]>
  >({});
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    // Bez `setPhase("loading")` w ciele efektu (kaskada renderów, którą łapie
    // lint): stan startowy to już „loading", a przy innym teście komponent
    // montuje się od nowa — strona nadaje mu `key` z identyfikatora.
    let active = true;

    api<TestQuestion[]>(`/admin/tests/${testId}/questions`)
      .then((data) => {
        if (!active) return;
        setQuestions(data);
        setPhase("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(messageOf(error, "Nie udało się wczytać banku pytań."));
        setPhase("load_error");
      });

    return () => {
      active = false;
    };
  }, [testId]);

  async function createQuestion() {
    const local = draftError(newDraft);
    if (local !== null) {
      setNewError(local);
      setNewFieldErrors({});

      return;
    }

    setCreating(true);
    setNewError(null);
    setNewFieldErrors({});

    try {
      const created = await api<TestQuestion>(
        `/admin/tests/${testId}/questions`,
        {
          method: "POST",
          body: {
            body: newDraft.body,
            answers: newDraft.answers.map((answer) => ({
              body: answer.body,
              is_correct: answer.is_correct,
            })),
          },
        },
      );

      setQuestions((prev) => [...prev, created]);
      setNewDraft(emptyDraft());
    } catch (error: unknown) {
      setNewError(messageOf(error, "Nie udało się dodać pytania."));
      setNewFieldErrors(fieldErrorsOf(error));
    } finally {
      setCreating(false);
    }
  }

  function startEdit(question: TestQuestion) {
    setEditingId(question.id);
    setEditDraft(draftFrom(question));
    setEditError(null);
    setEditFieldErrors({});
    setActionError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
    setEditError(null);
    setEditFieldErrors({});
  }

  async function saveEdit(questionId: number) {
    if (editDraft === null) return;

    const local = draftError(editDraft);
    if (local !== null) {
      setEditError(local);
      setEditFieldErrors({});

      return;
    }

    setSaving(true);
    setEditError(null);
    setEditFieldErrors({});

    try {
      const updated = await api<TestQuestion>(`/admin/questions/${questionId}`, {
        method: "PATCH",
        body: {
          body: editDraft.body,
          // Cały zestaw naraz: odpowiedzi z `id` są aktualizowane, bez `id`
          // tworzone, brakujące usuwane (`UpdateTestQuestionRequest`).
          answers: editDraft.answers.map((answer) => ({
            ...(answer.id === undefined ? {} : { id: answer.id }),
            body: answer.body,
            is_correct: answer.is_correct,
          })),
        },
      });

      setQuestions((prev) =>
        prev.map((question) =>
          question.id === questionId ? updated : question,
        ),
      );
      cancelEdit();
    } catch (error: unknown) {
      setEditError(messageOf(error, "Nie udało się zapisać pytania."));
      setEditFieldErrors(fieldErrorsOf(error));
    } finally {
      setSaving(false);
    }
  }

  async function removeQuestion(question: TestQuestion) {
    const skrot = question.body.slice(0, 80);

    if (
      !window.confirm(
        `Usunąć pytanie: ${skrot}? `
          + "Wyniki wcześniejszych podejść zostaną bez zmian.",
      )
    ) {
      return;
    }

    setRemovingId(question.id);
    setActionError(null);

    try {
      await api<{ id: number; deleted: boolean }>(
        `/admin/questions/${question.id}`,
        { method: "DELETE" },
      );
      setQuestions((prev) => prev.filter((item) => item.id !== question.id));
      if (editingId === question.id) cancelEdit();
    } catch (error: unknown) {
      setActionError(messageOf(error, "Nie udało się usunąć pytania."));
    } finally {
      setRemovingId(null);
    }
  }

  if (phase === "loading") {
    return (
      <Card title="Bank pytań">
        <p className="text-body text-muted" role="status" aria-live="polite">
          Wczytywanie pytań…
        </p>
      </Card>
    );
  }

  if (phase === "load_error") {
    return (
      <Card title="Bank pytań">
        <Alert variant="error" title="Nie udało się otworzyć banku pytań">
          {loadError ?? "Spróbuj ponownie za chwilę."}
        </Alert>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card title={`Bank pytań — pytań w teście: ${questions.length}`}>
        <p className="text-small text-muted">
          Zmiany w pytaniach nie dotykają zakończonych podejść: każde z nich ma
          własną kopię treści z chwili rozwiązywania.
        </p>

        {actionError && (
          <Alert variant="error" className="mt-4">
            {actionError}
          </Alert>
        )}

        {questions.length === 0 && (
          <p className="mt-4 text-body text-muted">
            Ten test nie ma jeszcze żadnego pytania.
          </p>
        )}

        <ul className="mt-4 space-y-4">
          {questions.map((question) => (
            <li
              key={question.id}
              className="rounded-md border border-line bg-card-warm p-4"
            >
              {editingId === question.id && editDraft !== null ? (
                <>
                  {editError && (
                    <Alert variant="error" className="mb-4">
                      {editError}
                    </Alert>
                  )}

                  <QuestionForm
                    draft={editDraft}
                    onChange={setEditDraft}
                    fieldErrors={editFieldErrors}
                    idPrefix={`pytanie-${question.id}`}
                    disabled={saving}
                  />

                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button
                      loading={saving}
                      onClick={() => void saveEdit(question.id)}
                    >
                      Zapisz pytanie
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={cancelEdit}
                      disabled={saving}
                    >
                      Anuluj
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="text-body font-medium text-ink">
                      {question.sequence_order}. {question.body}
                    </p>

                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => startEdit(question)}
                      >
                        Edytuj
                      </Button>
                      <Button
                        variant="ghost"
                        loading={removingId === question.id}
                        onClick={() => void removeQuestion(question)}
                      >
                        Usuń
                      </Button>
                    </div>
                  </div>

                  <ul className="mt-3 space-y-1">
                    {question.answers.map((answer) => (
                      <li
                        key={answer.id}
                        className={`text-small ${
                          answer.is_correct
                            ? "font-medium text-success"
                            : "text-muted"
                        }`}
                      >
                        <span aria-hidden="true">
                          {answer.is_correct ? "✓ " : "• "}
                        </span>
                        {answer.is_correct && (
                          <span className="sr-only">Poprawna odpowiedź: </span>
                        )}
                        {answer.body}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Nowe pytanie">
        {newError && (
          <Alert variant="error" className="mb-4">
            {newError}
          </Alert>
        )}

        <QuestionForm
          draft={newDraft}
          onChange={setNewDraft}
          fieldErrors={newFieldErrors}
          idPrefix="nowe-pytanie"
          disabled={creating}
        />

        <div className="mt-4">
          <Button loading={creating} onClick={() => void createQuestion()}>
            Dodaj pytanie
          </Button>
        </div>
      </Card>
    </div>
  );
}
