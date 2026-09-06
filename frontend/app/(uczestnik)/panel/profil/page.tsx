"use client";

import { useEffect, useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { api, ApiError, getToken } from "@/lib/api";

interface Consent {
  type: string;
  document_version: string | null;
  granted_at: string | null;
  withdrawn_at: string | null;
  status: "granted" | "withdrawn";
}

interface Profile {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  phone: string | null;
  pesel: string | null;
  address: { street: string | null; city: string | null; zip: string | null };
  access_expires_at: string | null;
  program_completed_at: string | null;
  product_group: string;
  consents: Consent[];
}

interface DataExport {
  id: string;
  status: "queued" | "processing" | "ready" | "failed";
  requested_at: string | null;
  completed_at: string | null;
  download_url: string | null;
}

type FormState = {
  first_name: string;
  last_name: string;
  phone: string;
  pesel: string;
  street: string;
  city: string;
  zip: string;
};

const EMPTY_FORM: FormState = {
  first_name: "",
  last_name: "",
  phone: "",
  pesel: "",
  street: "",
  city: "",
  zip: "",
};

const CONSENT_LABELS: Record<string, string> = {
  regulamin: "Regulamin platformy",
  polityka: "Polityka prywatności",
  publikacja_profilu: "Zgoda na publikację profilu",
  marketing: "Zgoda marketingowa",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function toForm(profile: Profile): FormState {
  return {
    first_name: profile.first_name ?? "",
    last_name: profile.last_name ?? "",
    phone: profile.phone ?? "",
    pesel: profile.pesel ?? "",
    street: profile.address.street ?? "",
    city: profile.address.city ?? "",
    zip: profile.address.zip ?? "",
  };
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [dataExport, setDataExport] = useState<DataExport | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [requestingExport, setRequestingExport] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;
    api<Profile>("/me")
      .then((data) => {
        if (!active) return;
        setProfile(data);
        setForm(toForm(data));
      })
      .catch(() => {
        if (active) setLoadError("Nie udało się wczytać profilu. Odśwież stronę.");
      });
    return () => {
      active = false;
    };
  }, []);

  // Poll while the export is still being built. Re-runs whenever `dataExport`
  // changes, scheduling exactly one follow-up request at a time.
  useEffect(() => {
    if (
      !dataExport ||
      (dataExport.status !== "queued" && dataExport.status !== "processing")
    ) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const next = await api<DataExport>(`/me/exports/${dataExport.id}`);
        setDataExport(next);
        if (next.status === "failed") {
          setExportError(
            "Przygotowanie eksportu nie powiodło się. Spróbuj ponownie.",
          );
        }
      } catch {
        setExportError("Nie udało się sprawdzić statusu eksportu.");
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [dataExport]);

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setFormError(null);
    setFieldErrors({});

    try {
      const updated = await api<Profile>("/me", {
        method: "PATCH",
        body: {
          first_name: form.first_name,
          last_name: form.last_name,
          phone: form.phone || null,
          pesel: form.pesel || null,
          address: {
            street: form.street || null,
            city: form.city || null,
            zip: form.zip || null,
          },
        },
      });
      setProfile(updated);
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

  async function requestExport() {
    setRequestingExport(true);
    setExportError(null);
    try {
      const created = await api<DataExport>("/me/exports", { method: "POST" });
      setDataExport(created); // the polling effect picks it up from here
    } catch (err) {
      setExportError(
        err instanceof ApiError
          ? err.message
          : "Nie udało się zlecić eksportu danych.",
      );
    } finally {
      setRequestingExport(false);
    }
  }

  async function handleDownload() {
    if (!dataExport) return;
    setDownloading(true);
    setExportError(null);
    try {
      const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")
        .replace(/\/+$/, "");
      const token = getToken();
      const res = await fetch(
        `${base}/api/v1/me/exports/${dataExport.id}/download`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `moje-dane-${dataExport.id}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Nie udało się pobrać pliku. Spróbuj ponownie.");
    } finally {
      setDownloading(false);
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl py-12">
        <Alert variant="error">{loadError}</Alert>
      </div>
    );
  }

  if (!profile) {
    return <p className="text-body text-muted">Wczytywanie profilu…</p>;
  }

  const err = (key: string) => fieldErrors[key]?.[0];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h2 font-black text-ink">Profil</h1>

      <Card title="Dane osobowe">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {formError && <Alert variant="error">{formError}</Alert>}
          {saved && <Alert variant="success">Zapisano zmiany.</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Imię"
              value={form.first_name}
              onChange={(e) => update("first_name", e.target.value)}
              error={err("first_name")}
            />
            <Input
              label="Nazwisko"
              value={form.last_name}
              onChange={(e) => update("last_name", e.target.value)}
              error={err("last_name")}
            />
          </div>

          <Input
            label="Adres e-mail"
            type="email"
            value={profile.email}
            readOnly
            disabled
            hint="Adres e-mail zmienia administracja — napisz do opiekuna projektu."
          />

          <Input
            className="sm:max-w-xs"
            label="Telefon"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            error={err("phone")}
          />

          <Input
            className="sm:max-w-[240px]"
            label="PESEL"
            inputMode="numeric"
            value={form.pesel}
            onChange={(e) => update("pesel", e.target.value)}
            error={err("pesel")}
            hint="Potrzebny do umowy wolontariackiej. Widoczny tylko dla Ciebie i administracji."
          />

          <fieldset className="flex flex-col gap-4">
            <legend className="text-small font-medium text-ink">Adres</legend>
            <Input
              label="Ulica i numer"
              value={form.street}
              onChange={(e) => update("street", e.target.value)}
              error={err("address.street")}
            />
            <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
              <Input
                label="Miejscowość"
                value={form.city}
                onChange={(e) => update("city", e.target.value)}
                error={err("address.city")}
              />
              <Input
                label="Kod pocztowy"
                inputMode="numeric"
                value={form.zip}
                onChange={(e) => update("zip", e.target.value)}
                error={err("address.zip")}
              />
            </div>
          </fieldset>

          <div className="flex justify-end">
            <Button type="submit" loading={saving}>
              Zapisz zmiany
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Zgody">
        {profile.consents.length === 0 ? (
          <p className="text-small text-muted">Brak zapisanych zgód.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {profile.consents.map((consent) => (
              <li
                key={consent.type}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="text-small font-medium text-ink">
                    {CONSENT_LABELS[consent.type] ?? consent.type}
                  </p>
                  <p className="text-caption text-subtle">
                    Wersja {consent.document_version ?? "—"} · z dnia{" "}
                    {formatDate(consent.granted_at)}
                  </p>
                </div>
                <Badge variant={consent.status === "granted" ? "success" : "neutral"}>
                  {consent.status === "granted" ? "Udzielona" : "Wycofana"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Eksport danych (RODO)">
        <p className="text-small text-muted">
          Przygotujemy plik ze wszystkimi Twoimi danymi: profil, zgody, postępy w
          nauce, wpisy stażu i lista wygenerowanych dokumentów. Przygotowanie trwa
          chwilę — powiadomimy Cię, gdy plik będzie gotowy.
        </p>

        {exportError && (
          <Alert variant="error" className="mt-4">
            {exportError}
          </Alert>
        )}

        {dataExport && dataExport.status !== "failed" && (
          <div className="mt-4 flex items-center gap-3 text-small">
            <Badge
              variant={dataExport.status === "ready" ? "success" : "info"}
            >
              {dataExport.status === "ready"
                ? "Gotowy"
                : "Przygotowywanie…"}
            </Badge>
            {dataExport.status === "ready" && (
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="font-medium text-primary underline focus-visible:focus-ring disabled:opacity-50"
              >
                {downloading ? "Pobieranie…" : "Pobierz plik"}
              </button>
            )}
          </div>
        )}

        <div className="mt-4">
          <Button
            variant="secondary"
            loading={requestingExport}
            onClick={requestExport}
          >
            {dataExport ? "Przygotuj nowy eksport" : "Przygotuj eksport danych"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
