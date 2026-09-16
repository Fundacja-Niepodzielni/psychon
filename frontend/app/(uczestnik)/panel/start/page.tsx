"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import OnboardingEditor from "@/components/onboarding/OnboardingEditor";
import OnboardingView from "@/components/onboarding/OnboardingView";
import type { Onboarding } from "@/components/onboarding/types";
import { api } from "@/lib/api";

interface Me {
  role: string;
  program_completed_at: string | null;
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

export default function ParticipantStartPage() {
  const [data, setData] = useState<Onboarding | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [programCompletedAt, setProgramCompletedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

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
        setProgramCompletedAt(me?.program_completed_at ?? null);
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
    setSaved(false);
    setEditing(true);
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

  if (editing) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-h2 font-black text-ink">Edytuj ekran „Zacznij tutaj”</h1>
        <OnboardingEditor
          data={data}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            setData(updated);
            setSaved(true);
            setEditing(false);
          }}
        />
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

      {programCompletedAt && (
        <Alert variant="info">
          Program ukończony {formatDateTime(programCompletedAt)}.{" "}
          <Link
            href="/panel/po-programie"
            className="font-medium text-info-dark underline focus-visible:focus-ring"
          >
            Przejdź do ekranu po programie
          </Link>
          .
        </Alert>
      )}

      {isAdmin && (
        <p className="text-caption text-subtle">
          Ostatnia zmiana treści: {formatDateTime(data.updated_at)}
        </p>
      )}

      <OnboardingView data={data} />
    </div>
  );
}
