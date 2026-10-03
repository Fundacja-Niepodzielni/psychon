"use client";

import { useEffect, useState } from "react";
import ActionRow from "@/components/molecules/ActionRow";
import ErrorState from "@/components/molecules/ErrorState";
import ForbiddenState from "@/components/molecules/ForbiddenState";
import LoadingState from "@/components/molecules/LoadingState";
import PageTemplate from "@/components/templates/PageTemplate";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import BulletList from "@/components/ui/BulletList";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Columns from "@/components/ui/Columns";
import Stack from "@/components/ui/Stack";
import Table from "@/components/ui/Table";
import Text from "@/components/ui/Text";
import TextLink from "@/components/ui/TextLink";
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

const LOAD_ERROR_MESSAGE = "Nie udało się pobrać listy dokumentów.";

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
  /** Dane przyszły choć raz — od tej chwili ekran pokazuje treść, nie stan wczytywania. */
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadForbidden, setLoadForbidden] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [generatingType, setGeneratingType] = useState<DocumentType | null>(null);
  const [typeErrors, setTypeErrors] = useState<Partial<Record<DocumentType, string>>>({});

  function readLoadFailure(err: unknown): { message: string | null; forbidden: boolean } {
    if (err instanceof ApiError && err.status === 403) {
      return { message: null, forbidden: true };
    }
    return {
      message: err instanceof ApiError ? err.message : LOAD_ERROR_MESSAGE,
      forbidden: false,
    };
  }

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
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const failure = readLoadFailure(err);
        setLoadError(failure.message);
        setLoadForbidden(failure.forbidden);
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
    setLoadForbidden(false);
    try {
      const result = await fetchDocuments();
      setDocuments(result.documents);
      setAvailableTypes(result.availableTypes);
      setLoaded(true);
    } catch (err) {
      const failure = readLoadFailure(err);
      setLoadError(failure.message);
      setLoadForbidden(failure.forbidden);
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload(doc: DocumentDto) {
    setDownloadingId(doc.id);
    setDownloadError(null);
    try {
      await downloadFile(doc.download_url, downloadFilename(doc));
    } catch (err) {
      setDownloadError(err instanceof ApiError ? err.message : "Nie udało się pobrać dokumentu.");
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
    <PageTemplate naglowek={{ title: "Dokumenty" }}>
      {loading && !loaded && <LoadingState label="Wczytywanie dokumentów…" />}
      {!loading && loadForbidden && (
        <ForbiddenState message="Nie masz uprawnień do wyświetlenia dokumentów." />
      )}
      {loadError && !loading && !loadForbidden && (
        <ErrorState
          title="Nie udało się wczytać dokumentów"
          message={loadError}
          onRetry={reload}
        />
      )}
      {downloadError && <Alert variant="error">{downloadError}</Alert>}

      {loaded && (
        <>
          <Card title="Twoje dokumenty">
            <Table
              caption="Wygenerowane dokumenty"
              rowKey={(doc) => doc.id}
              rows={documents}
              emptyMessage="Nie masz jeszcze żadnych dokumentów."
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
                  header: "Pobierz",
                  render: (doc) => (
                    <Button
                      variant="secondary"
                      loading={downloadingId === doc.id}
                      onClick={() => handleDownload(doc)}
                      aria-label={`Pobierz dokument ${doc.number}`}
                    >
                      Pobierz
                    </Button>
                  ),
                },
              ]}
            />
          </Card>

          <Columns from="md">
            {(Object.keys(TYPE_LABELS) as DocumentType[]).map((type) => {
              const state = availableTypes?.[type];
              const alreadyIssued = documents.some((doc) => doc.type === type);
              const typeError = typeErrors[type];

              return (
                <Card key={type} title={TYPE_LABELS[type]}>
                  <Stack>
                    <div>
                      {alreadyIssued ? (
                        <Badge variant="success">Wygenerowano</Badge>
                      ) : state?.available ? (
                        <Badge variant="accent">Dostępny do wygenerowania</Badge>
                      ) : (
                        <Badge variant="warning">Niedostępny</Badge>
                      )}
                    </div>

                    {!alreadyIssued &&
                      state &&
                      !state.available &&
                      state.reason === "profile_incomplete" && (
                        <Stack gap="tight">
                          <Text size="small" tone="muted">
                            Uzupełnij w profilu:
                          </Text>
                          <BulletList size="small" tone="muted">
                            {(state.missing_fields ?? []).map((field) => (
                              <li key={field}>{FIELD_LABELS[field] ?? field}</li>
                            ))}
                          </BulletList>
                          <Text size="small">
                            <TextLink href="/panel/profil">Przejdź do profilu</TextLink>
                          </Text>
                        </Stack>
                      )}

                    {!alreadyIssued &&
                      state &&
                      !state.available &&
                      state.reason === "conditions_not_met" && (
                        <Text size="small" tone="muted">
                          Godziny stażu zaakceptowane: {state.hours_accepted} z{" "}
                          {state.hours_required} wymaganych.
                        </Text>
                      )}

                    {typeError && <Alert variant="error">{typeError}</Alert>}

                    {!alreadyIssued && (
                      <ActionRow align="start">
                        <Button
                          disabled={!state?.available}
                          loading={generatingType === type}
                          onClick={() => handleGenerate(type)}
                          aria-label={`Wygeneruj: ${TYPE_LABELS[type]}`}
                        >
                          Wygeneruj
                        </Button>
                      </ActionRow>
                    )}
                  </Stack>
                </Card>
              );
            })}
          </Columns>
        </>
      )}
    </PageTemplate>
  );
}
