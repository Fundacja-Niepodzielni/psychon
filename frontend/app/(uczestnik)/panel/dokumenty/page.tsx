"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Table from "@/components/ui/Table";
import {
  ApiError,
  type DocumentAvailableTypes,
  type DocumentDto,
  type DocumentType,
  downloadFile,
  fetchDocuments,
  generateDocument,
} from "@/lib/api";

const TYPE_LABELS: Record<DocumentType, string> = {
  volunteer_agreement: "Porozumienie wolontariackie",
  internship_certificate: "Zaświadczenie o stażu",
};

const FIELD_LABELS: Record<string, string> = {
  first_name: "Imię",
  last_name: "Nazwisko",
  email: "Adres e-mail",
  phone: "Telefon",
  pesel: "PESEL",
  address_street: "Ulica i numer",
  address_city: "Miejscowość",
  address_zip: "Kod pocztowy",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function downloadFilename(doc: DocumentDto): string {
  return `${doc.number.replace(/\//g, "-")}.html`;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [availableTypes, setAvailableTypes] = useState<DocumentAvailableTypes | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [generatingType, setGeneratingType] = useState<DocumentType | null>(null);
  const [typeErrors, setTypeErrors] = useState<Partial<Record<DocumentType, string>>>({});

  // Fetch-on-mount as a plain promise chain (not a named async function
  // called from the effect body) — calling a state-setting function
  // synchronously from inside an effect trips react-hooks/set-state-in-effect.
  useEffect(() => {
    let cancelled = false;

    fetchDocuments()
      .then((result) => {
        if (cancelled) return;
        setDocuments(result.documents);
        setAvailableTypes(result.availableTypes);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiError ? err.message : "Nie udało się pobrać listy dokumentów.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function reload() {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await fetchDocuments();
      setDocuments(result.documents);
      setAvailableTypes(result.availableTypes);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Nie udało się pobrać listy dokumentów.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload(doc: DocumentDto) {
    setDownloadingId(doc.id);
    setLoadError(null);
    try {
      await downloadFile(doc.download_url, downloadFilename(doc));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Nie udało się pobrać dokumentu.");
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleGenerate(type: DocumentType) {
    setGeneratingType(type);
    setTypeErrors((prev) => ({ ...prev, [type]: undefined }));
    try {
      await generateDocument(type);
      await reload();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Nie udało się wygenerować dokumentu.";
      setTypeErrors((prev) => ({ ...prev, [type]: message }));
    } finally {
      setGeneratingType(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h2 font-black text-ink">Dokumenty</h1>

      {loadError && <Alert variant="error">{loadError}</Alert>}

      <Card title="Twoje dokumenty">
        <Table
          caption="Wygenerowane dokumenty"
          rowKey={(doc) => doc.id}
          rows={documents}
          emptyMessage={loading ? "Wczytywanie…" : "Nie masz jeszcze żadnych dokumentów."}
          columns={[
            { key: "number", header: "Numer", render: (doc) => doc.number },
            { key: "type", header: "Typ", render: (doc) => TYPE_LABELS[doc.type] },
            {
              key: "generated_at",
              header: "Data wydania",
              render: (doc) => formatDate(doc.generated_at),
            },
            {
              key: "download",
              header: "",
              className: "text-right",
              render: (doc) => (
                <Button
                  variant="secondary"
                  loading={downloadingId === doc.id}
                  onClick={() => handleDownload(doc)}
                >
                  Pobierz
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {(Object.keys(TYPE_LABELS) as DocumentType[]).map((type) => {
          const state = availableTypes?.[type];
          const alreadyIssued = documents.some((doc) => doc.type === type);
          const typeError = typeErrors[type];

          return (
            <Card key={type} title={TYPE_LABELS[type]}>
              <div className="flex flex-col gap-3">
                {alreadyIssued ? (
                  <Badge variant="success">Wygenerowano</Badge>
                ) : state?.available ? (
                  <Badge variant="accent">Dostępny do wygenerowania</Badge>
                ) : (
                  <Badge variant="warning">Niedostępny</Badge>
                )}

                {!alreadyIssued &&
                  state &&
                  !state.available &&
                  state.reason === "profile_incomplete" && (
                    <div className="text-small text-muted">
                      <p>Uzupełnij w profilu:</p>
                      <ul className="list-disc pl-5">
                        {(state.missing_fields ?? []).map((field) => (
                          <li key={field}>{FIELD_LABELS[field] ?? field}</li>
                        ))}
                      </ul>
                      <Link
                        href="/panel/profil"
                        className="mt-2 inline-block text-primary underline focus-visible:focus-ring"
                      >
                        Przejdź do profilu
                      </Link>
                    </div>
                  )}

                {!alreadyIssued &&
                  state &&
                  !state.available &&
                  state.reason === "conditions_not_met" && (
                    <p className="text-small text-muted">
                      Godziny stażu zaakceptowane: {state.hours_accepted} z{" "}
                      {state.hours_required} wymaganych.
                    </p>
                  )}

                {typeError && <Alert variant="error">{typeError}</Alert>}

                {!alreadyIssued && (
                  <Button
                    disabled={!state?.available}
                    loading={generatingType === type}
                    onClick={() => handleGenerate(type)}
                  >
                    Wygeneruj
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
