"use client";

import { useEffect, useState } from "react";
import QuestionForm from "@/components/h10/QuestionForm";
import ActionRow from "@/components/molecules/ActionRow";
import ErrorState from "@/components/molecules/ErrorState";
import ForbiddenState from "@/components/molecules/ForbiddenState";
import LoadingState from "@/components/molecules/LoadingState";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Inset from "@/components/ui/Inset";
import Stack from "@/components/ui/Stack";
import Text from "@/components/ui/Text";
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

/**
 * `forbidden` odróżnia brak uprawnień (403) od awarii wczytania (sieć/5xx):
 * pierwsze to odmowa, bez ponowienia — drugie to błąd, z przyciskiem, który
 * wywołuje ten sam efekt jeszcze raz.
 */
type Phase = "loading" | "ready" | "forbidden" | "load_error";

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
  const [attempt, setAttempt] = useState(0);

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
        if (error instanceof ApiError && error.status === 403) {
          setLoadError(messageOf(error, "Nie masz uprawnień do wyświetlenia banku pytań."));
          setPhase("forbidden");
        } else {
          setLoadError(messageOf(error, "Nie udało się wczytać banku pytań."));
          setPhase("load_error");
        }
      });

    return () => {
      active = false;
    };
  }, [testId, attempt]);

  function retryLoad() {
    setPhase("loading");
    setAttempt((n) => n + 1);
  }

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
        <LoadingState label="Wczytywanie pytań…" />
      </Card>
    );
  }

  if (phase === "forbidden") {
    return <ForbiddenState message={loadError ?? undefined} />;
  }

  if (phase === "load_error") {
    return (
      <Card title="Bank pytań">
        <ErrorState
          title="Nie udało się otworzyć banku pytań"
          message={loadError ?? "Spróbuj ponownie za chwilę."}
          onRetry={retryLoad}
        />
      </Card>
    );
  }

  return (
    <Stack gap="stack">
      <Card title={`Pytania w teście: ${questions.length}`}>
        <Stack>
          <Text size="small" tone="muted">
            Zmiany w pytaniach nie dotykają zakończonych podejść: każde z nich
            ma własną kopię treści z chwili rozwiązywania.
          </Text>

          {actionError && <Alert variant="error">{actionError}</Alert>}

          {questions.length === 0 && (
            <Text tone="muted">Ten test nie ma jeszcze żadnego pytania.</Text>
          )}

          <Stack as="ul">
            {questions.map((question) => (
              <Inset as="li" warm key={question.id}>
                {editingId === question.id && editDraft !== null ? (
                  <>
                    {editError && <Alert variant="error">{editError}</Alert>}

                    <QuestionForm
                      draft={editDraft}
                      onChange={setEditDraft}
                      fieldErrors={editFieldErrors}
                      idPrefix={`pytanie-${question.id}`}
                      disabled={saving}
                    />

                    <ActionRow align="start">
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
                    </ActionRow>
                  </>
                ) : (
                  <>
                    <Text>
                      <strong>
                        {question.sequence_order}. {question.body}
                      </strong>
                    </Text>

                    <ul className="flex flex-col gap-1">
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

                    <ActionRow align="start">
                      <Button
                        variant="secondary"
                        onClick={() => startEdit(question)}
                        aria-label={`Edytuj pytanie ${question.sequence_order}`}
                      >
                        Edytuj
                      </Button>
                      <Button
                        variant="ghost"
                        loading={removingId === question.id}
                        onClick={() => void removeQuestion(question)}
                        aria-label={`Usuń pytanie ${question.sequence_order}`}
                      >
                        Usuń
                      </Button>
                    </ActionRow>
                  </>
                )}
              </Inset>
            ))}
          </Stack>
        </Stack>
      </Card>

      <Card title="Nowe pytanie">
        <Stack>
          {newError && <Alert variant="error">{newError}</Alert>}

          <QuestionForm
            draft={newDraft}
            onChange={setNewDraft}
            fieldErrors={newFieldErrors}
            idPrefix="nowe-pytanie"
            disabled={creating}
          />

          <ActionRow align="start">
            <Button loading={creating} onClick={() => void createQuestion()}>
              Dodaj pytanie
            </Button>
          </ActionRow>
        </Stack>
      </Card>
    </Stack>
  );
}
