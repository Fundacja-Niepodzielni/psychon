"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import {
  ApiError,
  blockAdminUser,
  fetchAdminUser,
  updateAdminUser,
  type AdminUserCard as AdminUserCardData,
  type UserRole,
} from "@/lib/api";
import { DOCUMENT_TYPE_LABELS, ROLE_LABELS } from "@/lib/h18/labels";

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

type FormState = {
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
};

export default function AdminUserCard({ id }: { id: number }) {
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; card: AdminUserCardData } | null>(null);
  const [failed, setFailed] = useState<
    { key: string; kind: "not_found" | "error"; message: string } | null
  >(null);

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [blockReason, setBlockReason] = useState("");
  const [blocking, setBlocking] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);

  const key = `${id}#${reload}`;

  useEffect(() => {
    let active = true;
    fetchAdminUser(id)
      .then((card) => {
        if (!active) return;
        setLoaded({ key, card });
        setForm({
          first_name: card.profile.first_name,
          last_name: card.profile.last_name,
          email: card.profile.email,
          role: card.profile.role,
        });
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) {
          setFailed({ key, kind: "not_found", message: err.message });
          return;
        }
        setFailed({
          key,
          kind: "error",
          message:
            err instanceof ApiError
              ? err.message
              : "Nie udało się wczytać karty osoby.",
        });
      });
    return () => {
      active = false;
    };
  }, [id, key]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setSaved(false);
    setFormError(null);
    setFieldErrors({});
    try {
      const updated = await updateAdminUser(id, form);
      setLoaded({ key, card: updated });
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.errors) {
        setFieldErrors(err.errors);
        setFormError("Popraw zaznaczone pola.");
      } else if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Nie udało się zapisać zmian.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function block(e: FormEvent) {
    e.preventDefault();
    setBlocking(true);
    setBlockError(null);
    try {
      await blockAdminUser(id, blockReason.trim());
      setBlockReason("");
      setReload((v) => v + 1);
    } catch (err) {
      setBlockError(
        err instanceof ApiError ? err.message : "Nie udało się zablokować konta.",
      );
    } finally {
      setBlocking(false);
    }
  }

  if (failed?.key === key && failed.kind === "not_found") {
    return (
      <Card className="flex max-w-2xl flex-col gap-4">
        <h1 className="text-h3 font-black text-ink">Nie znaleziono osoby</h1>
        <Link
          href="/admin/uczestniczki"
          className="text-body font-medium text-primary underline underline-offset-4"
        >
          Wróć do listy
        </Link>
      </Card>
    );
  }

  if (failed?.key === key) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert variant="error">{failed.message}</Alert>
        <Button variant="secondary" onClick={() => setReload((v) => v + 1)}>
          Spróbuj ponownie
        </Button>
      </div>
    );
  }

  if (loaded?.key !== key || !form) {
    return (
      <p role="status" className="text-body text-muted">
        Wczytywanie karty…
      </p>
    );
  }

  const { profile, progress, documents, recent_notifications, audit_entries } =
    loaded.card;
  const err = (field: string) => fieldErrors[field]?.[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin/uczestniczki"
            className="text-small font-medium text-primary underline underline-offset-4"
          >
            ← Lista osób
          </Link>
          <h1 className="mt-1 text-h2 font-black text-ink">
            {profile.first_name} {profile.last_name}
          </h1>
        </div>
        <Badge variant="neutral">
          {ROLE_LABELS[profile.role] ?? profile.role}
        </Badge>
      </div>

      <Card title="Profil">
        <dl className="grid gap-3 text-small sm:grid-cols-2">
          <div>
            <dt className="text-subtle">E-mail</dt>
            <dd className="text-body text-ink">{profile.email}</dd>
          </div>
          <div>
            <dt className="text-subtle">Telefon</dt>
            <dd className="text-body text-ink">{profile.phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-subtle">PESEL</dt>
            <dd className="text-body text-ink">{profile.pesel ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-subtle">Grupa produktowa</dt>
            <dd className="text-body text-ink">{profile.product_group}</dd>
          </div>
          <div>
            <dt className="text-subtle">Adres</dt>
            <dd className="text-body text-ink">
              {[profile.address.street, profile.address.zip, profile.address.city]
                .filter(Boolean)
                .join(", ") || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-subtle">Dostęp do</dt>
            <dd className="text-body text-ink">
              {formatDateTime(profile.access_expires_at)}
            </dd>
          </div>
        </dl>
      </Card>

      <Card title="Postępy">
        <dl className="grid gap-3 text-small sm:grid-cols-2">
          <div>
            <dt className="text-subtle">Etapy i testy</dt>
            <dd className="text-body font-bold text-ink">
              {progress.courses_done} / {progress.courses_total}
            </dd>
          </div>
          <div>
            <dt className="text-subtle">Godziny stażu</dt>
            <dd className="text-body font-bold text-ink">
              {progress.hours_accepted}
            </dd>
          </div>
          <div>
            <dt className="text-subtle">Obecności na superwizji</dt>
            <dd className="text-body font-bold text-ink">
              {progress.supervision_present}
            </dd>
          </div>
          <div>
            <dt className="text-subtle">Warsztat stacjonarny</dt>
            <dd className="text-body font-bold text-ink">
              {progress.workshop_done ? "TAK" : "NIE"}
            </dd>
          </div>
        </dl>
      </Card>

      <Card title="Dokumenty">
        {documents.length === 0 ? (
          <p className="text-body text-muted">Brak dokumentów.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line text-small">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-4 py-2.5"
              >
                <span className="text-ink">
                  {DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}
                </span>
                <span className="text-muted">{doc.number}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Ostatnie powiadomienia">
        {recent_notifications.length === 0 ? (
          <p className="text-body text-muted">Brak powiadomień.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line text-small">
            {recent_notifications.map((n) => (
              <li
                key={n.id}
                className="flex items-center justify-between gap-4 py-2.5"
              >
                <span className="text-ink">{n.title}</span>
                <span className="flex items-center gap-2 text-muted">
                  {formatDateTime(n.created_at)}
                  {!n.read_at && <Badge variant="info">nowe</Badge>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Wpisy audytu">
        {audit_entries.length === 0 ? (
          <p className="text-body text-muted">
            Brak wpisów audytu dotyczących tej osoby.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line text-small">
            {audit_entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-4 py-2.5"
              >
                <span className="font-mono text-ink">{entry.action}</span>
                <span className="text-muted">
                  {formatDateTime(entry.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Edycja konta">
        <form onSubmit={saveProfile} noValidate className="flex flex-col gap-4">
          {formError && <Alert variant="error">{formError}</Alert>}
          {saved && <Alert variant="success">Zapisano zmiany.</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Imię"
              value={form.first_name}
              onChange={(e) =>
                setForm((f) => (f ? { ...f, first_name: e.target.value } : f))
              }
              error={err("first_name")}
            />
            <Input
              label="Nazwisko"
              value={form.last_name}
              onChange={(e) =>
                setForm((f) => (f ? { ...f, last_name: e.target.value } : f))
              }
              error={err("last_name")}
            />
            <Input
              label="E-mail"
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((f) => (f ? { ...f, email: e.target.value } : f))
              }
              error={err("email")}
            />
            <Select
              label="Rola"
              value={form.role}
              onChange={(e) =>
                setForm((f) =>
                  f ? { ...f, role: e.target.value as UserRole } : f,
                )
              }
              error={err("role")}
            >
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={saving}>
              Zapisz zmiany
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Blokada konta">
        {profile.role === "super_admin" && (
          <Alert variant="info">
            Kontami Super Admina zarządza wyłącznie Super Admin.
          </Alert>
        )}
        <form onSubmit={block} noValidate className="mt-3 flex flex-col gap-3">
          {blockError && <Alert variant="error">{blockError}</Alert>}
          <Input
            label="Powód blokady"
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            hint="Powód trafia do dziennika audytu. Zablokowana osoba przy logowaniu zobaczy komunikat o blokadzie, nie o wygaśnięciu dostępu."
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              variant="secondary"
              loading={blocking}
              disabled={blockReason.trim() === ""}
            >
              Zablokuj konto
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
