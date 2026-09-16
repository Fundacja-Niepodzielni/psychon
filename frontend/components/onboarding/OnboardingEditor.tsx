"use client";

import { useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Field from "@/components/ui/Field";
import Input from "@/components/ui/Input";
import { api, ApiError } from "@/lib/api";
import type { Onboarding } from "./types";

type FormState = {
  videoTitle: string;
  videoUrl: string;
  videoCaption: string;
  programTitle: string;
  programBody: string;
  expectationsTitle: string;
  expectationsBody: string;
};

function toForm(data: Onboarding): FormState {
  return {
    videoTitle: data.video.title ?? "",
    videoUrl: data.video.url ?? "",
    videoCaption: data.video.caption ?? "",
    programTitle: data.program.title ?? "",
    programBody: data.program.body ?? "",
    expectationsTitle: data.expectations.title ?? "",
    expectationsBody: data.expectations.body ?? "",
  };
}

const textareaClass =
  "rounded-sm border border-line bg-card px-4 py-2.5 text-body text-ink " +
  "placeholder:text-subtle focus-visible:focus-ring";

export interface OnboardingEditorProps {
  data: Onboarding;
  /** Wołane po udanym `PATCH /admin/onboarding` z zapisaną treścią. */
  onSaved: (updated: Onboarding) => void;
  /** Brak `onCancel` = brak przycisku „Anuluj" (ekran bez trybu podglądu obok). */
  onCancel?: () => void;
}

/**
 * Formularz treści ekranu „Zacznij tutaj" (H21) — trzy karty (film, przebieg
 * programu, oczekiwania), `PATCH /admin/onboarding`. Stany: zapisywanie
 * (`Button` w `loading`), zapisano (`Alert` sukcesu), błędy pól 422
 * (przy każdym polu, `Field`/`Input`), inny błąd zapisu (`Alert` błędu).
 * Używany na `/admin/ekran-startowy` (edytor + podgląd obok) i w trybie
 * edycji `/panel/start` (ten sam formularz, wołany przez rolę administracji
 * z poziomu ekranu uczestnika).
 */
export default function OnboardingEditor({
  data,
  onSaved,
  onCancel,
}: OnboardingEditorProps) {
  const [form, setForm] = useState<FormState>(() => toForm(data));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  const err = (key: string) => fieldErrors[key]?.[0];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    setSaved(false);

    try {
      const updated = await api<Onboarding>("/admin/onboarding", {
        method: "PATCH",
        body: {
          video: {
            title: form.videoTitle,
            url: form.videoUrl || null,
            caption: form.videoCaption || null,
          },
          program: { title: form.programTitle, body: form.programBody },
          expectations: {
            title: form.expectationsTitle,
            body: form.expectationsBody,
          },
        },
      });
      setSaved(true);
      onSaved(updated);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 422 && caught.errors) {
        setFieldErrors(caught.errors);
        setFormError("Popraw zaznaczone pola.");
      } else if (caught instanceof ApiError) {
        setFormError(caught.message);
      } else {
        setFormError("Nie udało się zapisać zmian. Spróbuj ponownie.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {formError && <Alert variant="error">{formError}</Alert>}
      {saved && <Alert variant="success">Zapisano treść ekranu.</Alert>}

      <Card title="Film powitalny">
        <div className="flex flex-col gap-4">
          <Input
            label="Tytuł"
            value={form.videoTitle}
            onChange={(e) => update("videoTitle", e.target.value)}
            error={err("video.title")}
          />
          <Input
            label="Adres filmu (URL)"
            value={form.videoUrl}
            onChange={(e) => update("videoUrl", e.target.value)}
            error={err("video.url")}
            hint="Zostaw puste, aby pokazać kafelek zastępczy z opisem poniżej."
          />
          <Input
            label="Opis pod filmem"
            value={form.videoCaption}
            onChange={(e) => update("videoCaption", e.target.value)}
            error={err("video.caption")}
          />
        </div>
      </Card>

      <Card title="Przebieg programu">
        <div className="flex flex-col gap-4">
          <Input
            label="Nagłówek sekcji"
            value={form.programTitle}
            onChange={(e) => update("programTitle", e.target.value)}
            error={err("program.title")}
          />
          <Field id="program-body" label="Treść" error={err("program.body")}>
            <textarea
              id="program-body"
              rows={5}
              value={form.programBody}
              onChange={(e) => update("programBody", e.target.value)}
              aria-invalid={err("program.body") ? true : undefined}
              aria-describedby={err("program.body") ? "program-body-error" : undefined}
              className={textareaClass}
            />
          </Field>
        </div>
      </Card>

      <Card title="Czego oczekujemy">
        <div className="flex flex-col gap-4">
          <Input
            label="Nagłówek sekcji"
            value={form.expectationsTitle}
            onChange={(e) => update("expectationsTitle", e.target.value)}
            error={err("expectations.title")}
          />
          <Field
            id="expectations-body"
            label="Treść"
            error={err("expectations.body")}
          >
            <textarea
              id="expectations-body"
              rows={5}
              value={form.expectationsBody}
              onChange={(e) => update("expectationsBody", e.target.value)}
              aria-invalid={err("expectations.body") ? true : undefined}
              aria-describedby={
                err("expectations.body") ? "expectations-body-error" : undefined
              }
              className={textareaClass}
            />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Anuluj
          </Button>
        )}
        <Button type="submit" loading={saving}>
          Zapisz treść
        </Button>
      </div>
    </form>
  );
}
