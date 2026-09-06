"use client";

import { useEffect, useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { api, ApiError } from "@/lib/api";
import type {
  ProfileDocumentType,
  PsychologistProfile,
} from "@/lib/h15/types";

const DOCUMENT_TYPE_LABELS: Record<ProfileDocumentType, string> = {
  dyplom: "Dyplom",
  niekaralnosc: "Zaświadczenie o niekaralności",
  inne: "Inny dokument",
};

const STATUS_LABELS: Record<PsychologistProfile["status"], string> = {
  draft: "Wersja robocza",
  submitted: "Oczekuje na weryfikację",
  returned: "Do poprawy",
  accepted: "Zaakceptowany",
  withdrawn: "Zgoda wycofana",
};

const STATUS_VARIANTS: Record<
  PsychologistProfile["status"],
  "neutral" | "success" | "warning" | "info"
> = {
  draft: "neutral",
  submitted: "info",
  returned: "warning",
  accepted: "success",
  withdrawn: "neutral",
};

function errorFor(errors: Record<string, string[]>, field: string): string | undefined {
  return errors[field]?.[0];
}

const MISSING_LABELS: Record<string, string> = {
  specializations: "specjalizacje",
  approach: "nurt terapeutyczny",
  city: "miasto",
  documents: "dyplom",
  consent: "zgoda na publikację",
};

export default function PsychologistProfileForm() {
  const [profile, setProfile] = useState<PsychologistProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [specializations, setSpecializations] = useState("");
  const [approach, setApproach] = useState("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [documentType, setDocumentType] = useState<ProfileDocumentType>("dyplom");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[] | null>(null);

  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  function applyProfile(data: PsychologistProfile) {
    setProfile(data);
    setSpecializations((data.specializations ?? []).join(", "));
    setApproach(data.approach ?? "");
    setCity(data.city ?? "");
    setBio(data.bio ?? "");
  }

  useEffect(() => {
    let cancelled = false;
    api<PsychologistProfile>("/psychologist-profile")
      .then((data) => {
        if (cancelled) return;
        applyProfile(data);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(
          error instanceof ApiError
            ? error.message
            : "Nie udało się wczytać wniosku. Odśwież stronę.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Alert variant="error">{loadError}</Alert>
      </div>
    );
  }

  if (!profile) {
    return (
      <p className="text-body text-muted" role="status">
        Wczytywanie…
      </p>
    );
  }

  if (!profile.eligible) {
    return (
      <div className="flex max-w-2xl flex-col gap-6">
        <h1 className="text-h2 font-black text-ink">Profil psychologa</h1>
        <Alert variant="info">
          Wniosek o wpis do bazy psychologów Fundacji będzie dostępny po
          ukończeniu całego programu.
        </Alert>
      </div>
    );
  }

  const editable = profile.status === "draft" || profile.status === "returned";
  const canWithdraw =
    profile.status === "submitted" ||
    profile.status === "returned" ||
    profile.status === "accepted";
  const canSubmit =
    editable &&
    specializations.trim() !== "" &&
    approach.trim() !== "" &&
    city.trim() !== "" &&
    profile.documents.some((doc) => doc.type === "dyplom") &&
    consent;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    setFieldErrors({});
    try {
      const updated = await api<PsychologistProfile>("/psychologist-profile", {
        method: "PATCH",
        body: {
          specializations: specializations
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          approach: approach || null,
          city: city || null,
          bio: bio || null,
        },
      });
      applyProfile(updated);
      setSaveMessage("Wniosek został zapisany.");
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 422 && error.errors) {
        setFieldErrors(error.errors);
        setSaveError("Popraw zaznaczone pola.");
      } else {
        setSaveError(
          error instanceof ApiError
            ? error.message
            : "Nie udało się zapisać wniosku. Spróbuj ponownie.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem(
      "file",
    ) as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      setUploadError("Wybierz plik przed dodaniem załącznika.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("type", documentType);
      formData.append("file", file);
      await api("/psychologist-profile/documents", { method: "POST", body: formData });
      const refreshed = await api<PsychologistProfile>("/psychologist-profile");
      applyProfile(refreshed);
      if (input) input.value = "";
    } catch (error: unknown) {
      setUploadError(
        error instanceof ApiError
          ? error.message
          : "Nie udało się dodać załącznika. Spróbuj ponownie.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function submitApplication() {
    setSubmitting(true);
    setSubmitError(null);
    setMissing(null);
    try {
      const updated = await api<PsychologistProfile>("/psychologist-profile/submit", {
        method: "POST",
        body: { publication_consent: consent },
      });
      applyProfile(updated);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.code === "profile_incomplete") {
        setMissing(error.reason?.missing ?? []);
        setSubmitError("Uzupełnij wniosek przed złożeniem.");
      } else {
        setSubmitError(
          error instanceof ApiError
            ? error.message
            : "Nie udało się złożyć wniosku. Spróbuj ponownie.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function withdrawConsent() {
    setWithdrawing(true);
    setWithdrawError(null);
    try {
      const updated = await api<PsychologistProfile>(
        "/psychologist-profile/consent/withdraw",
        { method: "POST" },
      );
      applyProfile(updated);
    } catch (error: unknown) {
      setWithdrawError(
        error instanceof ApiError
          ? error.message
          : "Nie udało się wycofać zgody. Spróbuj ponownie.",
      );
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h2 font-black text-ink">Profil psychologa</h1>
        <Badge variant={STATUS_VARIANTS[profile.status]}>
          {STATUS_LABELS[profile.status]}
        </Badge>
      </div>

      {profile.status === "returned" && profile.return_reason && (
        <Alert variant="info" title="Wniosek odesłany do poprawy">
          {profile.return_reason}
        </Alert>
      )}
      {saveMessage && <Alert variant="success">{saveMessage}</Alert>}

      <Card title="Dane wniosku">
        <form className="flex flex-col gap-4" onSubmit={save}>
          {saveError && <Alert variant="error">{saveError}</Alert>}
          <Input
            label="Specjalizacje"
            value={specializations}
            onChange={(event) => setSpecializations(event.target.value)}
            disabled={!editable}
            error={errorFor(fieldErrors, "specializations")}
            hint="Oddziel przecinkami, np.: wsparcie w kryzysie, praca z młodymi dorosłymi."
          />
          <Input
            label="Nurt terapeutyczny"
            value={approach}
            onChange={(event) => setApproach(event.target.value)}
            disabled={!editable}
            error={errorFor(fieldErrors, "approach")}
          />
          <Input
            label="Miasto"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            disabled={!editable}
            error={errorFor(fieldErrors, "city")}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="profile-bio" className="text-small font-medium text-ink">
              Opis (bio)
            </label>
            <textarea
              id="profile-bio"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              disabled={!editable}
              rows={4}
              className="rounded-sm border border-line bg-card px-4 py-2.5 text-body text-ink focus-visible:focus-ring disabled:opacity-60"
            />
          </div>
          {editable && (
            <div>
              <Button type="submit" loading={saving}>
                Zapisz zmiany
              </Button>
            </div>
          )}
        </form>
      </Card>

      <Card title="Załączniki weryfikacyjne">
        {profile.documents.length === 0 ? (
          <p className="text-body text-muted">Nie dodano jeszcze żadnych załączników.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {profile.documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-body text-ink">{DOCUMENT_TYPE_LABELS[doc.type]}</span>
                <span className="text-small text-muted">
                  {new Date(doc.uploaded_at).toLocaleDateString("pl-PL")}
                </span>
              </li>
            ))}
          </ul>
        )}

        {editable && (
          <form className="mt-4 flex flex-col gap-3 border-t border-line pt-4" onSubmit={uploadDocument}>
            {uploadError && <Alert variant="error">{uploadError}</Alert>}
            <Select
              label="Typ załącznika"
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value as ProfileDocumentType)}
            >
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="profile-document-file" className="text-small font-medium text-ink">
                Plik
              </label>
              <input
                id="profile-document-file"
                name="file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="rounded-sm border border-line bg-card px-4 py-2.5 text-body text-ink focus-visible:focus-ring"
              />
            </div>
            <div>
              <Button type="submit" variant="secondary" loading={uploading}>
                Dodaj załącznik
              </Button>
            </div>
          </form>
        )}
      </Card>

      {editable && (
        <Card title="Złożenie wniosku">
          {submitError && <Alert variant="error" className="mb-3">{submitError}</Alert>}
          {missing && missing.length > 0 && (
            <Alert variant="error" className="mb-3">
              Brakuje: {missing.map((key) => MISSING_LABELS[key] ?? key).join(", ")}.
            </Alert>
          )}
          <label className="mb-4 flex items-start gap-2 text-body text-ink">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-1"
            />
            <span>Wyrażam zgodę na publikację mojego profilu w bazie psychologów Fundacji.</span>
          </label>
          <Button onClick={submitApplication} loading={submitting} disabled={!canSubmit}>
            Złóż wniosek
          </Button>
          {!canSubmit && (
            <p className="mt-2 text-caption text-subtle">
              Uzupełnij specjalizacje, nurt, miasto i dyplom oraz zaznacz zgodę na
              publikację, aby złożyć wniosek.
            </p>
          )}
        </Card>
      )}

      {canWithdraw && (
        <Card title="Zgoda na publikację">
          {withdrawError && <Alert variant="error" className="mb-3">{withdrawError}</Alert>}
          <p className="mb-3 text-body text-muted">
            Możesz w każdej chwili wycofać zgodę na publikację profilu. Wniosek
            przejdzie wtedy w stan „zgoda wycofana&rdquo; i nie będzie już edytowalny.
          </p>
          <Button variant="secondary" onClick={withdrawConsent} loading={withdrawing}>
            Wycofaj zgodę
          </Button>
        </Card>
      )}
    </div>
  );
}
