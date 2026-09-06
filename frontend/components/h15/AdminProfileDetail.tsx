"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { api, downloadFile, ApiError } from "@/lib/api";
import type { AdminPsychologistProfile, ProfileDocumentType } from "@/lib/h15/types";

const DOCUMENT_TYPE_LABELS: Record<ProfileDocumentType, string> = {
  dyplom: "Dyplom",
  niekaralnosc: "Zaświadczenie o niekaralności",
  inne: "Inny dokument",
};

export default function AdminProfileDetail({ id }: { id: number }) {
  const [profile, setProfile] = useState<AdminPsychologistProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<AdminPsychologistProfile>(`/admin/profiles/${id}`)
      .then((data) => {
        if (cancelled) return;
        setProfile(data);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(
          error instanceof ApiError ? error.message : "Nie udało się wczytać wniosku.",
        );
      });
    return () => { cancelled = true; };
  }, [id]);

  async function accept() {
    setProcessing(true);
    setActionError(null);
    try {
      const updated = await api<AdminPsychologistProfile>(`/admin/profiles/${id}/accept`, { method: "POST" });
      setProfile(updated);
    } catch (error: unknown) {
      setActionError(error instanceof ApiError ? error.message : "Nie udało się zaakceptować wniosku.");
    } finally {
      setProcessing(false);
    }
  }

  async function returnProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) {
      setReasonError("Dodaj powód przed odesłaniem wniosku.");
      return;
    }
    setReasonError(null);
    setProcessing(true);
    setActionError(null);
    try {
      const updated = await api<AdminPsychologistProfile>(`/admin/profiles/${id}/return`, {
        method: "POST",
        body: { reason: trimmed },
      });
      setProfile(updated);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 422 && error.errors?.reason?.[0]) {
        setReasonError(error.errors.reason[0]);
      } else {
        setActionError(error instanceof ApiError ? error.message : "Nie udało się odesłać wniosku.");
      }
    } finally {
      setProcessing(false);
    }
  }

  async function download(url: string, filename: string) {
    setDownloadError(null);
    try {
      await downloadFile(url, filename);
    } catch (error: unknown) {
      setDownloadError(error instanceof ApiError ? error.message : "Nie udało się pobrać załącznika.");
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl py-10">
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

  const decidable = profile.status === "submitted";

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <Link href="/admin/profile" className="text-small text-primary hover:underline">
          ← Wróć do kolejki
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h2 font-black text-ink">
          {profile.user.first_name} {profile.user.last_name}
        </h1>
        <Badge variant={profile.status === "submitted" ? "info" : "neutral"}>
          {profile.status}
        </Badge>
      </div>

      <Card title="Dane wniosku">
        <dl className="flex flex-col gap-2 text-body text-ink">
          <div><dt className="inline text-muted">Specjalizacje: </dt><dd className="inline">{(profile.specializations ?? []).join(", ") || "—"}</dd></div>
          <div><dt className="inline text-muted">Nurt: </dt><dd className="inline">{profile.approach ?? "—"}</dd></div>
          <div><dt className="inline text-muted">Miasto: </dt><dd className="inline">{profile.city ?? "—"}</dd></div>
          <div><dt className="inline text-muted">Bio: </dt><dd className="inline whitespace-pre-wrap">{profile.bio ?? "—"}</dd></div>
          <div><dt className="inline text-muted">Zgoda na publikację: </dt><dd className="inline">{profile.publication_consent_granted ? "udzielona" : "brak"}</dd></div>
        </dl>
      </Card>

      <Card title="Załączniki">
        {downloadError && <Alert variant="error" className="mb-3">{downloadError}</Alert>}
        {profile.documents.length === 0 ? (
          <p className="text-body text-muted">Brak załączników.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {profile.documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-body text-ink">{DOCUMENT_TYPE_LABELS[doc.type]}</span>
                <Button
                  variant="secondary"
                  onClick={() => download(doc.download_url, `${doc.type}-${doc.id}`)}
                >
                  Pobierz
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {decidable && (
        <Card title="Decyzja">
          {actionError && <Alert variant="error" className="mb-3">{actionError}</Alert>}
          <div className="flex flex-col gap-4">
            <Button onClick={accept} loading={processing}>Akceptuj wniosek</Button>
            <form className="flex flex-col gap-2 border-t border-line pt-4" onSubmit={returnProfile}>
              <label htmlFor="return-reason" className="text-small font-medium text-ink">Powód odesłania</label>
              <textarea
                id="return-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                aria-invalid={reasonError ? true : undefined}
                aria-describedby="return-reason-error"
                rows={3}
                className={`rounded-sm border bg-card px-4 py-2.5 text-body text-ink focus-visible:focus-ring ${reasonError ? "border-danger" : "border-line"}`}
              />
              {reasonError && <p id="return-reason-error" className="text-caption font-medium text-danger" role="alert">{reasonError}</p>}
              <Button type="submit" variant="secondary" loading={processing}>Odeślij do poprawy</Button>
            </form>
          </div>
        </Card>
      )}
    </div>
  );
}
