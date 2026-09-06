"use client";

import { useEffect, useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { ApiError } from "@/lib/api";
import {
  askQuestion,
  fetchLessonQuestions,
  formatQuestionDate,
  type ParticipantQuestion,
} from "@/lib/questions";

export interface LessonQuestionsProps {
  lessonId: number;
  lessonTitle: string;
}

/**
 * Pytania uczestniczki przy jednej lekcji (pakiet H17): formularz oraz lista
 * własnych pytań z odpowiedziami prowadzącego.
 */
export default function LessonQuestions({
  lessonId,
  lessonTitle,
}: LessonQuestionsProps) {
  const [questions, setQuestions] = useState<ParticipantQuestion[]>([]);
  const [question, setQuestion] = useState("");
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchLessonQuestions(lessonId)
      .then((data) => {
        if (cancelled) return;
        setQuestions(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;

        // Kurs zablokowany albo trasa jeszcze niezatwierdzona — sekcja po prostu
        // nie pokazuje listy, bo uczestniczka i tak nie ma tu czego czytać.
        if (
          err instanceof ApiError &&
          (err.status === 403 || err.status === 404)
        ) {
          setQuestions([]);
          return;
        }

        setError("Nie udało się wczytać Twoich pytań.");
      });

    return () => {
      cancelled = true;
    };
  }, [lessonId, reload]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(null);

    askQuestion(lessonId, question)
      .then(() => {
        setQuestion("");
        setOpen(false);
        setSent(true);
        setReload((value) => value + 1);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError
            ? err.message
            : "Nie udało się wysłać pytania. Spróbuj ponownie.",
        );
      })
      .finally(() => setSending(false));
  }

  return (
    <div className="flex flex-col gap-3">
      {!open && (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            setOpen(true);
            setSent(false);
          }}
        >
          Zadaj pytanie prowadzącemu
        </Button>
      )}

      {sent && (
        <Alert variant="success">
          Pytanie zostało wysłane. Odpowiedź pojawi się tutaj i w powiadomieniach.
        </Alert>
      )}

      {open && (
        <form className="flex flex-col gap-2" onSubmit={submit}>
          <label
            className="text-caption font-bold tracking-wide text-subtle"
            htmlFor={`question-${lessonId}`}
          >
            Pytanie do lekcji „{lessonTitle}”
          </label>
          <textarea
            id={`question-${lessonId}`}
            className="min-h-24 rounded-md border border-line bg-card px-3 py-2 text-body text-ink focus-visible:focus-ring"
            value={question}
            maxLength={2000}
            required
            onChange={(event) => setQuestion(event.target.value)}
          />
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={sending}>
              Wyślij pytanie
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
            >
              Anuluj
            </Button>
          </div>
        </form>
      )}

      {!open && error && <Alert variant="error">{error}</Alert>}

      {questions.length > 0 && (
        <ul className="flex flex-col gap-3">
          {questions.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-1 rounded-md bg-grey px-3 py-2"
            >
              <p className="text-caption text-subtle">
                Twoje pytanie · {formatQuestionDate(item.created_at)}
              </p>
              {/* Treść jako tekst — nigdy dangerouslySetInnerHTML. */}
              <p className="whitespace-pre-wrap text-body text-ink">
                {item.question}
              </p>

              {item.answer === null ? (
                <p className="text-caption text-muted">
                  Czeka na odpowiedź prowadzącego.
                </p>
              ) : (
                <div className="mt-1 flex flex-col gap-1 border-l-4 border-brand pl-3">
                  <p className="text-caption font-bold tracking-wide text-subtle">
                    {item.answered_by_name ?? "Prowadzący"}
                    {item.answered_at
                      ? ` · ${formatQuestionDate(item.answered_at)}`
                      : ""}
                  </p>
                  <p className="whitespace-pre-wrap text-body text-ink">
                    {item.answer}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
