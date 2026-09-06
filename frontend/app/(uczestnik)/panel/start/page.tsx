"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { api, ApiError } from "@/lib/api";

interface VideoSection {
  title: string;
  url: string | null;
  caption: string | null;
}

interface TextSection {
  title: string;
  body: string;
}

interface Onboarding {
  video: VideoSection;
  program: TextSection;
  expectations: TextSection;
  updated_at: string | null;
}

interface Me {
  role: string;
}

const ADMIN_ROLES = ["super_admin", "project_manager"];

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Zamienia typowy link do YouTube/Vimeo na adres do osadzenia w <iframe>. */
function toEmbedUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.hostname === "youtu.be") {
      return `https://www.youtube.com/embed/${url.pathname.slice(1)}`;
    }
    if (url.hostname.endsWith("youtube.com") && url.searchParams.has("v")) {
      return `https://www.youtube.com/embed/${url.searchParams.get("v")}`;
    }
    return raw;
  } catch {
    return raw;
  }
}

function VideoBlock({ video }: { video: VideoSection }) {
  if (video.url) {
    return (
      <div className="overflow-hidden rounded-sm border border-line bg-ink">
        <div className="relative aspect-video">
          <iframe
            src={toEmbedUrl(video.url)}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 size-full"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-line bg-grey text-center">
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-pill bg-card text-primary shadow-card"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-6">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
      <p className="max-w-sm px-4 text-small text-muted">
        {video.caption ?? "Film pojawi się tutaj wkrótce."}
      </p>
    </div>
  );
}

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

export default function ParticipantStartPage() {
  const [data, setData] = useState<Onboarding | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let active = true;
    Promise.all([
      api<Onboarding>("/onboarding"),
      api<Me>("/me").catch(() => null),
    ])
      .then(([onboarding, me]) => {
        if (!active) return;
        setData(onboarding);
        setRole(me?.role ?? null);
      })
      .catch(() => {
        if (active) {
          setLoadError("Nie udało się wczytać ekranu. Odśwież stronę.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const isAdmin = useMemo(
    () => (role !== null ? ADMIN_ROLES.includes(role) : false),
    [role],
  );

  function startEditing() {
    if (!data) return;
    setForm(toForm(data));
    setFieldErrors({});
    setFormError(null);
    setSaved(false);
    setEditing(true);
  }

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setFormError(null);
    setFieldErrors({});

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
      setData(updated);
      setSaved(true);
      setEditing(false);
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
    return (
      <div className="mx-auto max-w-xl py-12">
        <Alert variant="error">{loadError}</Alert>
      </div>
    );
  }

  if (!data) {
    return <p className="text-body text-muted">Wczytywanie…</p>;
  }

  const err = (key: string) => fieldErrors[key]?.[0];

  if (editing && form) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-h2 font-black text-ink">Edytuj ekran „Zacznij tutaj”</h1>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
          {formError && <Alert variant="error">{formError}</Alert>}

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
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="program-body"
                  className="text-small font-medium text-ink"
                >
                  Treść
                </label>
                <textarea
                  id="program-body"
                  rows={5}
                  value={form.programBody}
                  onChange={(e) => update("programBody", e.target.value)}
                  className={textareaClass}
                />
                {err("program.body") && (
                  <p className="text-caption font-medium text-danger">
                    {err("program.body")}
                  </p>
                )}
              </div>
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
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="expectations-body"
                  className="text-small font-medium text-ink"
                >
                  Treść
                </label>
                <textarea
                  id="expectations-body"
                  rows={5}
                  value={form.expectationsBody}
                  onChange={(e) => update("expectationsBody", e.target.value)}
                  className={textareaClass}
                />
                {err("expectations.body") && (
                  <p className="text-caption font-medium text-danger">
                    {err("expectations.body")}
                  </p>
                )}
              </div>
            </div>
          </Card>

          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Anuluj
            </Button>
            <Button type="submit" loading={saving}>
              Zapisz treść
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-h2 font-black text-ink">Zacznij tutaj</h1>
        {isAdmin && (
          <Button variant="secondary" onClick={startEditing}>
            Edytuj treść
          </Button>
        )}
      </div>

      {saved && <Alert variant="success">Zapisano treść ekranu.</Alert>}

      {isAdmin && (
        <p className="text-caption text-subtle">
          Ostatnia zmiana treści: {formatDateTime(data.updated_at)}
        </p>
      )}

      <Card title={data.video.title}>
        <VideoBlock video={data.video} />
        {data.video.url && data.video.caption && (
          <p className="mt-3 text-small text-muted">{data.video.caption}</p>
        )}
      </Card>

      <Card title={data.program.title}>
        <p className="whitespace-pre-line text-body text-muted">
          {data.program.body}
        </p>
      </Card>

      <Card title={data.expectations.title} warm>
        <p className="whitespace-pre-line text-body text-muted">
          {data.expectations.body}
        </p>
      </Card>
    </div>
  );
}
