"use client";

import { useEffect, useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { ApiError } from "@/lib/api";
import {
  answerQuestion,
  fetchInstructorQuestions,
  formatQuestionDate,
  unansweredCount,
  type InstructorQuestion,
} from "@/lib/questions";

/** Skrzynka pytań prowadzącego (pakiet H17, zakładka „Pytania"). */
export default function InstructorQuestionInbox() {
  const [questions, setQuestions] = useState<InstructorQuestion[]>([]);
  const [unanswered, setUnanswered] = useState(0);
  const [onlyUnanswered, setOnlyUnanswered] = useState(true);
  const [loadedFilter, setLoadedFilter] = useState<boolean | null>(null);
  const [reload, setReload] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchInstructorQuestions(onlyUnanswered ? { answered: false } : {})
      .then((page) => {
        if (cancelled) return;
        setQuestions(page.data);
        setUnanswered(unansweredCount(page.meta));
        setLoadError(null);
        setLoadedFilter(onlyUnanswered);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(
          error instanceof ApiError
            ? error.message
            : "Nie udało się połączyć z serwerem. Spróbuj ponownie.",
        );
        setLoadedFilter(onlyUnanswered);
      });

    return () => {
      cancelled = true;
    };
  }, [onlyUnanswered, reload]);

  const loading = loadedFilter !== onlyUnanswered;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-h2 font-black text-ink">Pytania</h1>
          <Badge variant={unanswered > 0 ? "warning" : "neutral"}>
            {unanswered === 0
              ? "Brak nieodpowiedzianych"
              : `Nieodpowiedziane: ${unanswered}`}
          </Badge>
        </div>

        <Button
          variant="secondary"
          onClick={() => setOnlyUnanswered((value) => !value)}
          aria-pressed={onlyUnanswered}
        >
          {onlyUnanswered ? "Pokaż wszystkie" : "Tylko nieodpowiedziane"}
        </Button>
      </div>

      {loading && (
        <Card>
          <p className="text-body text-muted">Wczytuję pytania…</p>
        </Card>
      )}

      {!loading && loadError && (
        <Alert variant="error" title="Nie udało się wczytać pytań">
          {loadError}
        </Alert>
      )}

      {!loading && !loadError && questions.length === 0 && (
        <Card>
          <p className="text-body text-muted">
            {onlyUnanswered
              ? "Nie masz pytań oczekujących na odpowiedź."
              : "Nie masz jeszcze żadnych pytań."}
          </p>
        </Card>
      )}

      {!loading &&
        !loadError &&
        questions.map((question) => (
          <QuestionCard
            key={question.id}
            question={question}
            onAnswered={() => setReload((value) => value + 1)}
          />
        ))}
    </div>
  );
}

function QuestionCard({
  question,
  onAnswered,
}: {
  question: InstructorQuestion;
  onAnswered: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAnswered = question.answered_at !== null;

  function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    answerQuestion(question.id, answer)
      .then(() => onAnswered())
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError
            ? err.message
            : "Nie udało się zapisać odpowiedzi. Spróbuj ponownie.",
        );
      })
      .finally(() => setSaving(false));
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={isAnswered ? "success" : "warning"}>
          {isAnswered ? "Odpowiedziane" : "Oczekuje"}
        </Badge>
        <p className="text-caption text-subtle">
          {question.user.first_name} {question.user.last_name} ·{" "}
          {question.lesson.course.title} · {question.lesson.title} ·{" "}
          {formatQuestionDate(question.created_at)}
        </p>
      </div>

      {/* Treść renderowana jako tekst — nigdy dangerouslySetInnerHTML. */}
      <p className="whitespace-pre-wrap text-body text-ink">
        {question.question}
      </p>

      {isAnswered ? (
        <div className="flex flex-col gap-1 border-l-4 border-brand pl-4">
          <p className="text-caption font-bold tracking-wide text-subtle">
            Twoja odpowiedź
            {question.answered_at
              ? ` · ${formatQuestionDate(question.answered_at)}`
              : ""}
          </p>
          <p className="whitespace-pre-wrap text-body text-ink">
            {question.answer}
          </p>
        </div>
      ) : (
        <form className="flex flex-col gap-2" onSubmit={submit}>
          <label
            className="text-caption font-bold tracking-wide text-subtle"
            htmlFor={`answer-${question.id}`}
          >
            Odpowiedź
          </label>
          <textarea
            id={`answer-${question.id}`}
            className="min-h-24 rounded-md border border-line bg-card px-3 py-2 text-body text-ink focus-visible:focus-ring"
            value={answer}
            maxLength={5000}
            required
            onChange={(event) => setAnswer(event.target.value)}
          />
          {error && <Alert variant="error">{error}</Alert>}
          <Button type="submit" loading={saving} className="self-start">
            Wyślij odpowiedź
          </Button>
        </form>
      )}
    </Card>
  );
}
