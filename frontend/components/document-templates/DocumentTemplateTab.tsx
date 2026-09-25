"use client";

import { useEffect, useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Field from "@/components/ui/Field";
import Table, { type Column } from "@/components/ui/Table";
import ErrorState from "@/components/molecules/ErrorState";
import ForbiddenState from "@/components/molecules/ForbiddenState";
import LoadingState from "@/components/molecules/LoadingState";
import {
  ApiError,
  fetchDocumentTemplate,
  fetchDocumentTemplateVersions,
  updateDocumentTemplate,
  type DocumentTemplate,
  type DocumentTemplateType,
  type DocumentTemplateVersion,
} from "@/lib/api";

export interface DocumentTemplateTabProps {
  type: DocumentTemplateType;
  /** Nazwa wzoru w dopełniaczu, do komunikatów ekranu (np. "wzoru porozumienia"). */
  label: string;
}

const textareaClass =
  "min-h-80 rounded-sm border border-line bg-card px-4 py-2.5 font-mono text-small text-ink " +
  "placeholder:text-subtle focus-visible:focus-ring";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" });
}

const LOAD_ERROR_MESSAGE = "Nie udało się wczytać wzoru dokumentu. Spróbuj ponownie.";

/**
 * Zawartość jednej zakładki ekranu „Wzory dokumentów" (administracja) —
 * treść jednego typu wzoru (`type`): edytor obok podglądu, zapis (`PUT`,
 * kontrakt `content` min. 1 znak) i pod spodem historia wersji, sam odczyt
 * (`GET .../versions`). `Tabs` montuje ten komponent dopiero wtedy, gdy
 * użytkownik otworzy tę zakładkę — trzy zakładki nie odpytują API naraz.
 */
export default function DocumentTemplateTab({ type, label }: DocumentTemplateTabProps) {
  const [data, setData] = useState<DocumentTemplate | null>(null);
  const [versions, setVersions] = useState<DocumentTemplateVersion[] | null>(null);
  const [content, setContent] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorStatus, setLoadErrorStatus] = useState<number | undefined>();
  const [reloadKey, setReloadKey] = useState(0);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | undefined>();

  // Fetch-on-mount jako łańcuch obietnic (bez synchronicznego setState przed
  // pierwszym `await`) — wzorzec z `admin/ekran-startowy/page.tsx`.
  useEffect(() => {
    let active = true;
    Promise.all([fetchDocumentTemplate(type), fetchDocumentTemplateVersions(type)])
      .then(([template, history]) => {
        if (!active) return;
        setData(template);
        setContent(template.content);
        setVersions(history);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setLoadError(caught instanceof ApiError ? caught.message : LOAD_ERROR_MESSAGE);
        setLoadErrorStatus(caught instanceof ApiError ? caught.status : undefined);
      });
    return () => {
      active = false;
    };
  }, [type, reloadKey]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setFormError(null);
    setContentError(undefined);

    try {
      const updated = await updateDocumentTemplate(type, content);
      setData(updated);
      setContent(updated.content);
      // Historia dostaje nowy wpis od razu — te same pola już przyszły w
      // odpowiedzi zapisu, więc nie trzeba drugiego GET .../versions.
      setVersions((prev) => [
        { version: updated.version, updated_at: updated.updated_at, updated_by: updated.updated_by },
        ...(prev ?? []),
      ]);
      setSaved(true);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 422 && caught.errors) {
        setContentError(caught.errors.content?.[0]);
        setFormError("Popraw treść wzoru.");
      } else if (caught instanceof ApiError && caught.status === 403) {
        setFormError("Nie masz uprawnień do zapisania tego wzoru.");
      } else if (caught instanceof ApiError) {
        setFormError(caught.message);
      } else {
        setFormError("Nie udało się zapisać zmian. Spróbuj ponownie.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loadError && loadErrorStatus === 403) {
    return <ForbiddenState message={`Nie masz uprawnień do wyświetlenia ${label}.`} />;
  }

  if (loadError) {
    return (
      <ErrorState
        message={loadError}
        onRetry={() => {
          setLoadError(null);
          setLoadErrorStatus(undefined);
          setReloadKey((key) => key + 1);
        }}
      />
    );
  }

  if (!data || !versions) {
    return <LoadingState label={`Wczytywanie ${label}…`} />;
  }

  const columns: Column<DocumentTemplateVersion>[] = [
    { key: "version", header: "Wersja", render: (row) => `#${row.version}` },
    { key: "when", header: "Data", render: (row) => formatDate(row.updated_at) },
    { key: "who", header: "Osoba", render: (row) => row.updated_by.name },
  ];

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        {formError && <Alert variant="error">{formError}</Alert>}
        {saved && <Alert variant="success">Zapisano {label} — wersja #{data.version}.</Alert>}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Treść">
            <Field id={`${type}-content`} label="Treść wzoru" error={contentError}>
              <textarea
                id={`${type}-content`}
                rows={16}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setSaved(false);
                }}
                aria-invalid={contentError ? true : undefined}
                className={textareaClass}
              />
            </Field>
          </Card>

          <Card title="Podgląd">
            <div className="whitespace-pre-line text-body text-pretty">{content}</div>
          </Card>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-caption text-muted">
            Wersja #{data.version} · zapisano {formatDate(data.updated_at)} przez{" "}
            {data.updated_by.name}
          </p>
          <Button type="submit" loading={saving}>
            Zapisz zmiany
          </Button>
        </div>
      </form>

      <Card title="Historia wersji">
        <Table
          columns={columns}
          rows={versions}
          rowKey={(row) => row.version}
          caption={`Historia wersji — ${label}`}
          emptyMessage="Brak wcześniejszych wersji."
        />
      </Card>
    </div>
  );
}
