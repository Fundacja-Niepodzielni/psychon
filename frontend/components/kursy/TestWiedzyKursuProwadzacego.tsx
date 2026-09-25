"use client";

import { useEffect, useState, type FormEvent } from "react";
import ActionRow from "@/components/molecules/ActionRow";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Form from "@/components/ui/Form";
import Input from "@/components/ui/Input";
import { ApiError } from "@/lib/api/klient";
import type { AdminCourse } from "@/lib/h08/types";
import {
  createInstructorTest,
  fetchInstructorTest,
  updateInstructorTest,
  type InstructorTest,
} from "@/lib/api/prowadzacy-kursy";

function messageFrom(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

interface TestForm {
  pass_threshold: string;
  attempts_limit: string;
  question_count: string;
}

function toForm(test: InstructorTest | null): TestForm {
  return {
    pass_threshold: test?.pass_threshold?.toString() ?? "",
    attempts_limit: test?.attempts_limit?.toString() ?? "",
    question_count: test?.question_count?.toString() ?? "10",
  };
}

export interface TestWiedzyKursuProwadzacegoProps {
  course: AdminCourse;
}

/**
 * Założenie i edycja testu wiedzy kursu w panelu prowadzącego — bez banku
 * pytań (ten zostaje w panelu administracji, poza zakresem tej trasy).
 */
export default function TestWiedzyKursuProwadzacego({
  course,
}: TestWiedzyKursuProwadzacegoProps) {
  const [test, setTest] = useState<InstructorTest | null | undefined>(
    undefined,
  );
  const [form, setForm] = useState<TestForm>(toForm(null));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>(
    {},
  );

  useEffect(() => {
    let active = true;

    fetchInstructorTest(course.id)
      .then((data) => {
        if (!active) return;
        setTest(data);
        setForm(toForm(data));
      })
      .catch(() => {
        if (!active) return;
        setTest(null);
      });

    return () => {
      active = false;
    };
  }, [course.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();

    setSaving(true);
    setSaved(false);
    setFormError(null);
    setFieldErrors({});

    const body = {
      pass_threshold: form.pass_threshold ? Number(form.pass_threshold) : null,
      attempts_limit: form.attempts_limit ? Number(form.attempts_limit) : null,
      question_count: Number(form.question_count || "10"),
    };

    try {
      const result = test
        ? await updateInstructorTest(test.id, body)
        : await createInstructorTest(course.id, body);
      setTest(result);
      setForm(toForm(result));
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.errors) {
        setFieldErrors(err.errors);
        setFormError("Popraw zaznaczone pola.");
      } else {
        setFormError(
          messageFrom(err, "Nie udało się zapisać testu. Spróbuj ponownie."),
        );
      }
    } finally {
      setSaving(false);
    }
  }

  if (test === undefined) return null;

  const err = (key: string) => fieldErrors[key]?.[0];

  return (
    <Card title="Test wiedzy">
      <Form onSubmit={submit} bledyPol={fieldErrors}>
        <div className="flex flex-col gap-4">
          {formError && <Alert variant="error">{formError}</Alert>}
          {saved && <Alert variant="success">Zapisano zmiany.</Alert>}

          <p className="text-small text-muted">
            {test
              ? "Edycja nie zmienia wyników wcześniejszych podejść."
              : "Ten kurs nie ma jeszcze testu wiedzy."}
          </p>

          <Input
            label="Próg zaliczenia (%)"
            type="number"
            min={1}
            max={100}
            value={form.pass_threshold}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, pass_threshold: e.target.value }))
            }
            error={err("pass_threshold")}
            hint="Puste pole = wartość edycji."
          />
          <Input
            label="Limit podejść"
            type="number"
            min={1}
            value={form.attempts_limit}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, attempts_limit: e.target.value }))
            }
            error={err("attempts_limit")}
            hint="Puste pole = wartość edycji."
          />
          <Input
            label="Liczba pytań"
            type="number"
            min={1}
            value={form.question_count}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, question_count: e.target.value }))
            }
            error={err("question_count")}
          />

          <ActionRow>
            <Button type="submit" loading={saving}>
              {test ? "Zapisz test" : "Załóż test"}
            </Button>
          </ActionRow>
        </div>
      </Form>
    </Card>
  );
}
