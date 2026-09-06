"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ProgressBar from "@/components/ui/ProgressBar";
import { api, ApiError, apiPaged } from "@/lib/api";

interface Answer {
  id: number;
  body: string;
}

interface Question {
  id: number;
  body: string;
  sequence_order: number;
  answers: Answer[];
}

interface TestPayload {
  test_id: number;
  pass_threshold: number;
  attempts_used: number;
  attempts_limit: number;
  questions: Question[];
}

interface AttemptResult {
  attempt_number: number;
  score_percent: number;
  passed: boolean;
  wrong_question_ids: number[];
}

interface AttemptHistoryRow {
  attempt_number: number;
  score_percent: number;
  passed: boolean;
  created_at: string | null;
}

type Phase = "loading" | "locked" | "intro" | "running" | "result" | "error";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CourseTestPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [test, setTest] = useState<TestPayload | null>(null);
  const [history, setHistory] = useState<AttemptHistoryRow[]>([]);

  const [current, setCurrent] = useState(0);
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);

  const loadHistory = useCallback(async (testId: number) => {
    try {
      const page = await apiPaged<AttemptHistoryRow>(
        `/tests/${testId}/attempts`,
      );
      setHistory(page.data);
    } catch {
      // historia jest pomocnicza — brak nie blokuje ekranu
    }
  }, []);

  const loadTest = useCallback(
    () =>
      api<TestPayload>(`/courses/${slug}/test`)
        .then((payload) => {
          setTest(payload);
          setCurrent(0);
          setPicked({});
          setResult(null);
          setPhase("intro");
          void loadHistory(payload.test_id);
        })
        .catch((err) => {
          if (err instanceof ApiError && err.code === "course_locked") {
            setMessage(err.message);
            setPhase("locked");
          } else if (err instanceof ApiError) {
            setMessage(err.message);
            setPhase("error");
          } else {
            setMessage("Nie udało się wczytać testu. Odśwież stronę.");
            setPhase("error");
          }
        }),
    [slug, loadHistory],
  );

  useEffect(() => {
    void loadTest();
  }, [loadTest]);

  const restart = useCallback(() => {
    setPhase("loading");
    setMessage(null);
    void loadTest();
  }, [loadTest]);

  const attemptsLeft = useMemo(
    () => (test ? Math.max(0, test.attempts_limit - test.attempts_used) : 0),
    [test],
  );

  const question = test?.questions[current];
  const isLast = test ? current === test.questions.length - 1 : false;

  async function submit() {
    if (!test) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await api<AttemptResult>(`/tests/${test.test_id}/attempts`, {
        method: "POST",
        body: { answers: picked },
      });
      setResult(res);
      setPhase("result");
      void loadHistory(test.test_id);
    } catch (err) {
      if (err instanceof ApiError && err.code === "attempts_exhausted") {
        setMessage(err.message);
        setPhase("result");
      } else if (err instanceof ApiError) {
        setMessage(err.message);
      } else {
        setMessage("Nie udało się wysłać testu. Spróbuj ponownie.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const backToCourse = (
    <Link
      href={`/panel/kursy/${slug}`}
      className="text-body font-medium text-primary underline underline-offset-4"
    >
      Wróć do kursu
    </Link>
  );

  if (phase === "loading") {
    return <p className="text-body text-muted">Wczytywanie testu…</p>;
  }

  if (phase === "locked") {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 py-10">
        <h1 className="text-h2 font-black text-ink">Test niedostępny</h1>
        <Alert variant="info" title="Ten etap jest jeszcze zamknięty">
          {message ?? "Ukończ najpierw poprzedni etap ścieżki."}
        </Alert>
        {backToCourse}
      </div>
    );
  }

  if (phase === "error" || !test) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Alert variant="error">{message ?? "Wystąpił błąd."}</Alert>
      </div>
    );
  }

  const historyCard = history.length > 0 && (
    <Card title="Historia podejść">
      <ul className="flex flex-col divide-y divide-line">
        {history.map((row) => (
          <li
            key={row.attempt_number}
            className="flex items-center justify-between gap-4 py-2.5 text-small"
          >
            <span className="text-muted">
              Podejście {row.attempt_number} · {formatDate(row.created_at)}
            </span>
            <span className="flex items-center gap-3">
              <span className="font-bold text-ink">{row.score_percent}%</span>
              <Badge variant={row.passed ? "success" : "danger"}>
                {row.passed ? "zaliczone" : "niezaliczone"}
              </Badge>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );

  if (phase === "intro") {
    return (
      <div className="flex max-w-2xl flex-col gap-6">
        <h1 className="text-h2 font-black text-ink">Test wiedzy</h1>

        <Card>
          <dl className="grid grid-cols-2 gap-4 text-small">
            <div>
              <dt className="text-subtle">Pytania</dt>
              <dd className="text-body font-bold text-ink">
                {test.questions.length}
              </dd>
            </div>
            <div>
              <dt className="text-subtle">Próg zaliczenia</dt>
              <dd className="text-body font-bold text-ink">
                {test.pass_threshold}%
              </dd>
            </div>
            <div>
              <dt className="text-subtle">Wykorzystane podejścia</dt>
              <dd className="text-body font-bold text-ink">
                {test.attempts_used} / {test.attempts_limit}
              </dd>
            </div>
            <div>
              <dt className="text-subtle">Pozostało podejść</dt>
              <dd className="text-body font-bold text-ink">{attemptsLeft}</dd>
            </div>
          </dl>
          <p className="mt-4 text-small text-muted">
            Pytania pokazują się pojedynczo, bez możliwości cofania. Po
            udzieleniu wszystkich odpowiedzi test zostanie sprawdzony
            automatycznie.
          </p>
        </Card>

        {message && <Alert variant="error">{message}</Alert>}

        <div className="flex items-center gap-4">
          <Button
            onClick={() => setPhase("running")}
            disabled={attemptsLeft === 0}
          >
            Rozpocznij test
          </Button>
          {backToCourse}
        </div>

        {attemptsLeft === 0 && (
          <Alert variant="info">
            Nie masz już dostępnych podejść. Skontaktuj się z opiekunem
            projektu, aby zresetować limit.
          </Alert>
        )}

        {historyCard}
      </div>
    );
  }

  if (phase === "running" && question) {
    const answeredCurrent = picked[question.id] !== undefined;
    const answeredCount = Object.keys(picked).length;

    return (
      <div className="flex max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-caption font-bold uppercase tracking-wide text-subtle">
            Pytanie {current + 1} z {test.questions.length}
          </span>
          <ProgressBar
            value={(answeredCount / test.questions.length) * 100}
            label="Postęp testu"
          />
        </div>

        <Card>
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-2 text-h4 font-bold text-ink">
              {question.body}
            </legend>
            {question.answers.map((answer) => {
              const selected = picked[question.id] === answer.id;
              return (
                <label
                  key={answer.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-sm border px-4 py-3 text-body transition-colors ${
                    selected
                      ? "border-primary bg-brand-10 text-ink"
                      : "border-line bg-card text-muted hover:bg-grey"
                  }`}
                >
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    className="mt-1 accent-primary"
                    checked={selected}
                    onChange={() =>
                      setPicked((prev) => ({
                        ...prev,
                        [question.id]: answer.id,
                      }))
                    }
                  />
                  <span>{answer.body}</span>
                </label>
              );
            })}
          </fieldset>
        </Card>

        {message && <Alert variant="error">{message}</Alert>}

        <div className="flex justify-end">
          {isLast ? (
            <Button
              onClick={submit}
              disabled={!answeredCurrent}
              loading={submitting}
            >
              Zakończ i sprawdź
            </Button>
          ) : (
            <Button
              onClick={() => setCurrent((i) => i + 1)}
              disabled={!answeredCurrent}
            >
              Następne pytanie
            </Button>
          )}
        </div>
      </div>
    );
  }

  // phase === "result"
  const wrongQuestions =
    result?.wrong_question_ids
      .map((id) => test.questions.find((q) => q.id === id))
      .filter((q): q is Question => q !== undefined) ?? [];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-h2 font-black text-ink">Wynik testu</h1>

      {message && !result && <Alert variant="error">{message}</Alert>}

      {result && (
        <>
          <Card warm={!result.passed}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-caption text-subtle">
                  Podejście {result.attempt_number}
                </p>
                <p className="text-h1 font-black text-ink">
                  {result.score_percent}%
                </p>
                <p className="text-small text-muted">
                  Próg zaliczenia: {test.pass_threshold}%
                </p>
              </div>
              <Badge variant={result.passed ? "success" : "danger"}>
                {result.passed ? "Zaliczony" : "Niezaliczony"}
              </Badge>
            </div>
          </Card>

          <Alert variant={result.passed ? "success" : "error"}>
            {result.passed
              ? "Gratulacje — kolejny etap ścieżki został odblokowany."
              : `Test niezaliczony. Pozostało podejść: ${Math.max(
                  0,
                  test.attempts_limit - result.attempt_number,
                )}.`}
          </Alert>

          {wrongQuestions.length > 0 && (
            <Card title="Pytania z błędną odpowiedzią">
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-body text-muted">
                {wrongQuestions.map((q) => (
                  <li key={q.id}>{q.body}</li>
                ))}
              </ol>
            </Card>
          )}
        </>
      )}

      <div className="flex items-center gap-4">
        {result &&
          !result.passed &&
          result.attempt_number < test.attempts_limit && (
            <Button onClick={restart}>Podejdź ponownie</Button>
          )}
        {backToCourse}
      </div>

      {historyCard}
    </div>
  );
}
