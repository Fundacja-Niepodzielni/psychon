"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import ProgressBar from "@/components/ui/ProgressBar";
import Select from "@/components/ui/Select";
import { api, apiPaged, ApiError, type PaginationMeta } from "@/lib/api";
import type {
  InternshipEntry,
  InternshipForm,
  InternshipStatus,
} from "@/lib/h11/types";

type EntryForm = {
  date: string;
  hours: string;
  form: InternshipForm;
  consultations_count: string;
  description: string;
};

const FORM_LABELS: Record<InternshipForm, string> = {
  phone_duty: "Dyżur telefoniczny",
  chat_duty: "Czat",
  other: "Inna forma",
};

const STATUS_LABELS: Record<InternshipStatus, string> = {
  submitted: "Oczekuje na akceptację",
  accepted: "Zaakceptowany",
  returned: "Do poprawy",
};

const STATUS_VARIANTS: Record<
  InternshipStatus,
  "neutral" | "success" | "warning" | "info"
> = {
  submitted: "info",
  accepted: "success",
  returned: "warning",
};

function today(): string {
  const date = new Date();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function emptyForm(): EntryForm {
  return {
    date: today(),
    hours: "0.5",
    form: "phone_duty",
    consultations_count: "0",
    description: "",
  };
}

function toForm(entry: InternshipEntry): EntryForm {
  return {
    date: entry.date,
    hours: entry.hours,
    form: entry.form,
    consultations_count: `${entry.consultations_count}`,
    description: entry.description ?? "",
  };
}

function errorFor(errors: Record<string, string[]>, field: string): string | undefined {
  return errors[field]?.[0];
}

export default function InternshipJournal() {
  const [entries, setEntries] = useState<InternshipEntry[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | undefined>();
  const [page, setPage] = useState(1);
  const [loadedPage, setLoadedPage] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [form, setForm] = useState<EntryForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiPaged<InternshipEntry>(`/internship/entries?page=${page}&per_page=25`)
      .then(({ data, meta: responseMeta }) => {
        if (cancelled) return;
        setEntries(data);
        setMeta(responseMeta);
        setLoadError(null);
        setLoadedPage(page);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(
          error instanceof ApiError
            ? error.message
            : "Nie udało się wczytać dziennika. Spróbuj ponownie.",
        );
        setLoadedPage(page);
      });

    return () => {
      cancelled = true;
    };
  }, [page, reload]);

  const loading = loadedPage !== page && loadError === null;
  const acceptedHours = String(meta?.extra?.accepted_hours ?? "0");
  const requiredHours = String(meta?.extra?.required_hours ?? "0");
  const progress = useMemo(() => {
    const required = Number(requiredHours);
    return required > 0 ? (Number(acceptedHours) / required) * 100 : 0;
  }, [acceptedHours, requiredHours]);

  function updateForm<K extends keyof EntryForm>(key: K, value: EntryForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSavedMessage(null);
  }

  function startEdit(entry: InternshipEntry) {
    if (entry.status === "accepted") return;
    setEditingId(entry.id);
    setForm(toForm(entry));
    setFormError(null);
    setFieldErrors({});
    setSavedMessage(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
    setFieldErrors({});
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    setSavedMessage(null);

    try {
      const payload = {
        date: form.date,
        hours: form.hours,
        form: form.form,
        consultations_count: Number(form.consultations_count),
        description: form.description || null,
      };
      const updated = editingId === null
        ? await api<InternshipEntry>("/internship/entries", { method: "POST", body: payload })
        : await api<InternshipEntry>(`/internship/entries/${editingId}`, { method: "PATCH", body: payload });

      setEntries((current) =>
        editingId === null
          ? [updated, ...current]
          : current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      setEditingId(null);
      setForm(emptyForm());
      setSavedMessage(
        editingId === null
          ? "Wpis został zapisany i wysłany do akceptacji."
          : "Wpis został poprawiony i ponownie wysłany do akceptacji.",
      );
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 422 && error.errors) {
        setFieldErrors(error.errors);
        setFormError("Popraw zaznaczone pola.");
      } else {
        setFormError(
          error instanceof ApiError
            ? error.message
            : "Nie udało się zapisać wpisu. Spróbuj ponownie.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h2 font-black text-ink">Dziennik stażu</h1>
        <p className="mt-2 text-body text-muted">
          Zapisuj swoje dyżury i śledź zaakceptowane godziny.
        </p>
      </div>

      {savedMessage && <Alert variant="success">{savedMessage}</Alert>}

      <Card title="Twój postęp">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-small text-muted">Zaakceptowane godziny</p>
            <p className="text-h3 font-black text-ink">
              {acceptedHours} <span className="text-body font-normal text-muted">z {requiredHours} h</span>
            </p>
          </div>
          <Badge variant="accent">Łącznie</Badge>
        </div>
        <ProgressBar
          className="mt-4"
          value={progress}
          label={`Postęp stażu: ${acceptedHours} z ${requiredHours} godzin`}
          showValue
        />
      </Card>

      <Card title={editingId === null ? "Dodaj wpis" : "Popraw wpis"}>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          {formError && <Alert variant="error">{formError}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Data dyżuru"
              type="date"
              value={form.date}
              max={today()}
              onChange={(event) => updateForm("date", event.target.value)}
              error={errorFor(fieldErrors, "date")}
            />
            <Input
              label="Liczba godzin"
              type="number"
              min="0.5"
              max="24"
              step="0.5"
              value={form.hours}
              onChange={(event) => updateForm("hours", event.target.value)}
              error={errorFor(fieldErrors, "hours")}
              hint="Od 0,5 do 24 godzin, co 0,5 godziny."
            />
            <Select
              label="Forma dyżuru"
              value={form.form}
              onChange={(event) => updateForm("form", event.target.value as InternshipForm)}
              error={errorFor(fieldErrors, "form")}
            >
              {Object.entries(FORM_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
            <Input
              label="Liczba konsultacji"
              type="number"
              min="0"
              step="1"
              value={form.consultations_count}
              onChange={(event) => updateForm("consultations_count", event.target.value)}
              error={errorFor(fieldErrors, "consultations_count")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="internship-description" className="text-small font-medium text-ink">
              Opis dyżuru
            </label>
            <textarea
              id="internship-description"
              value={form.description}
              onChange={(event) => updateForm("description", event.target.value)}
              aria-invalid={errorFor(fieldErrors, "description") ? true : undefined}
              aria-describedby="internship-description-note internship-description-error"
              rows={4}
              className={`rounded-sm border bg-card px-4 py-2.5 text-body text-ink focus-visible:focus-ring ${errorFor(fieldErrors, "description") ? "border-danger" : "border-line"}`}
            />
            <p id="internship-description-note" className="text-caption text-subtle">
              Nie wpisuj danych osób konsultowanych.
            </p>
            {errorFor(fieldErrors, "description") && (
              <p id="internship-description-error" className="text-caption font-medium text-danger">
                {errorFor(fieldErrors, "description")}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={saving}>
              {editingId === null ? "Zapisz i wyślij" : "Wyślij ponownie"}
            </Button>
            {editingId !== null && (
              <Button type="button" variant="secondary" onClick={cancelEdit} disabled={saving}>
                Anuluj
              </Button>
            )}
          </div>
        </form>
      </Card>

      <section aria-labelledby="internship-entries-heading" className="flex flex-col gap-3">
        <h2 id="internship-entries-heading" className="text-h3 font-black text-ink">Twoje wpisy</h2>
        {loadError && (
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{loadError}</span>
              <Button variant="secondary" onClick={() => { setLoadError(null); setLoadedPage(null); setReload((value) => value + 1); }}>
                Spróbuj ponownie
              </Button>
            </div>
          </Alert>
        )}
        {loading ? (
          <p className="rounded-md border border-line bg-card px-4 py-8 text-center text-body text-subtle" role="status">
            Wczytywanie dziennika…
          </p>
        ) : !loadError && entries.length === 0 ? (
          <Card><p className="text-body text-muted">Nie masz jeszcze żadnych wpisów. Dodaj pierwszy powyżej.</p></Card>
        ) : !loadError ? (
          <div className="flex flex-col gap-3">
            {entries.map((entry) => (
              <Card key={entry.id} className="border-l-4 border-l-brand">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-h4 font-bold text-ink">{entry.date}</p>
                    <p className="text-small text-muted">
                      {entry.hours} h · {FORM_LABELS[entry.form]} · konsultacji: {entry.consultations_count}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANTS[entry.status]}>
                    {STATUS_LABELS[entry.status]}
                  </Badge>
                </div>
                {entry.description && (
                  <p className="mt-3 whitespace-pre-wrap text-body text-muted">{entry.description}</p>
                )}
                {entry.review_comment && (
                  <Alert variant="info" className="mt-3">
                    <strong>Komentarz opiekuna:</strong> {entry.review_comment}
                  </Alert>
                )}
                <div className="mt-4">
                  {entry.status === "accepted" ? (
                    <p className="text-small font-medium text-success" role="status">Wpis zablokowany po akceptacji.</p>
                  ) : (
                    <Button variant="secondary" onClick={() => startEdit(entry)}>
                      {entry.status === "returned" ? "Popraw i wyślij ponownie" : "Edytuj wpis"}
                    </Button>
                  )}
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
      </section>
    </div>
  );
}
