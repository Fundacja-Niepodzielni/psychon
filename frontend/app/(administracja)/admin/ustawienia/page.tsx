"use client";

import { useEffect, useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { api, ApiError } from "@/lib/api";

interface Edition {
  id: number;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  seats_limit: number | null;
  test_pass_threshold: number;
  test_attempts_limit: number;
  internship_hours_required: number;
  supervision_required_count: number;
  reliability_threshold: number;
  lesson_completion_percent: number;
}

type FormState = {
  name: string;
  starts_at: string;
  ends_at: string;
  seats_limit: string;
  test_pass_threshold: string;
  test_attempts_limit: string;
  internship_hours_required: string;
  supervision_required_count: string;
  reliability_threshold: string;
  lesson_completion_percent: string;
};

function toForm(edition: Edition): FormState {
  return {
    name: edition.name,
    starts_at: edition.starts_at ?? "",
    ends_at: edition.ends_at ?? "",
    seats_limit: edition.seats_limit?.toString() ?? "",
    test_pass_threshold: edition.test_pass_threshold.toString(),
    test_attempts_limit: edition.test_attempts_limit.toString(),
    internship_hours_required: edition.internship_hours_required.toString(),
    supervision_required_count: edition.supervision_required_count.toString(),
    reliability_threshold: edition.reliability_threshold.toString(),
    lesson_completion_percent: edition.lesson_completion_percent.toString(),
  };
}

function toPayload(form: FormState): Record<string, unknown> {
  return {
    name: form.name,
    starts_at: form.starts_at || null,
    ends_at: form.ends_at || null,
    seats_limit: form.seats_limit ? Number(form.seats_limit) : null,
    test_pass_threshold: Number(form.test_pass_threshold),
    test_attempts_limit: Number(form.test_attempts_limit),
    internship_hours_required: Number(form.internship_hours_required),
    supervision_required_count: Number(form.supervision_required_count),
    reliability_threshold: Number(form.reliability_threshold),
    lesson_completion_percent: Number(form.lesson_completion_percent),
  };
}

export default function EditionSettingsPage() {
  const [edition, setEdition] = useState<Edition | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let active = true;
    api<Edition>("/admin/edition")
      .then((data) => {
        if (!active) return;
        setEdition(data);
        setForm(toForm(data));
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(
          err instanceof ApiError
            ? err.message
            : "Nie udało się wczytać ustawień edycji. Odśwież stronę.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;

    setSaving(true);
    setSaved(false);
    setFormError(null);
    setFieldErrors({});

    try {
      const updated = await api<Edition>("/admin/edition", {
        method: "PATCH",
        body: toPayload(form),
      });
      setEdition(updated);
      setForm(toForm(updated));
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.errors) {
        setFieldErrors(err.errors);
        setFormError("Popraw zaznaczone pola.");
      } else if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Nie udało się zapisać zmian. Spróbuj ponownie.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return <Alert variant="error">{loadError}</Alert>;
  }

  if (!edition || !form) {
    return <p className="text-body text-muted">Wczytywanie ustawień…</p>;
  }

  const err = (key: string) => fieldErrors[key]?.[0];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-h2 font-black text-ink">Ustawienia edycji</h1>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        {formError && <Alert variant="error">{formError}</Alert>}
        {saved && <Alert variant="success">Zapisano zmiany.</Alert>}

        <Card title="Edycja">
          <div className="flex flex-col gap-4">
            <Input
              label="Nazwa edycji"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              error={err("name")}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Data rozpoczęcia"
                type="date"
                value={form.starts_at}
                onChange={(e) => update("starts_at", e.target.value)}
                error={err("starts_at")}
              />
              <Input
                label="Data zakończenia"
                type="date"
                value={form.ends_at}
                onChange={(e) => update("ends_at", e.target.value)}
                error={err("ends_at")}
              />
            </div>
            <Input
              className="sm:max-w-[200px]"
              label="Limit miejsc"
              type="number"
              min={1}
              value={form.seats_limit}
              onChange={(e) => update("seats_limit", e.target.value)}
              error={err("seats_limit")}
            />
          </div>
        </Card>

        <Card title="Reguły programu">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Próg zaliczenia testu (%)"
              type="number"
              min={0}
              max={100}
              value={form.test_pass_threshold}
              onChange={(e) => update("test_pass_threshold", e.target.value)}
              error={err("test_pass_threshold")}
            />
            <Input
              label="Limit podejść do testu"
              type="number"
              min={1}
              value={form.test_attempts_limit}
              onChange={(e) => update("test_attempts_limit", e.target.value)}
              error={err("test_attempts_limit")}
            />
            <Input
              label="Wymagane godziny stażu"
              type="number"
              min={1}
              value={form.internship_hours_required}
              onChange={(e) =>
                update("internship_hours_required", e.target.value)
              }
              error={err("internship_hours_required")}
            />
            <Input
              label="Wymagana liczba obecności na superwizji"
              type="number"
              min={1}
              value={form.supervision_required_count}
              onChange={(e) =>
                update("supervision_required_count", e.target.value)
              }
              error={err("supervision_required_count")}
            />
            <Input
              label="Próg rzetelności (%)"
              type="number"
              min={0}
              max={100}
              value={form.reliability_threshold}
              onChange={(e) => update("reliability_threshold", e.target.value)}
              error={err("reliability_threshold")}
            />
            <Input
              label="Próg ukończenia lekcji (%)"
              type="number"
              min={0}
              max={100}
              value={form.lesson_completion_percent}
              onChange={(e) =>
                update("lesson_completion_percent", e.target.value)
              }
              error={err("lesson_completion_percent")}
              hint="Udział czasu aktywnego oglądania wymagany do ukończenia lekcji."
            />
          </div>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" loading={saving}>
            Zapisz zmiany
          </Button>
        </div>
      </form>
    </div>
  );
}
