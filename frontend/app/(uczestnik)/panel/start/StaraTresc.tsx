"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import ErrorState from "@/components/molecules/ErrorState";
import LoadingState from "@/components/molecules/LoadingState";
import PageTemplate from "@/components/templates/PageTemplate";
import OnboardingEditor from "@/components/onboarding/OnboardingEditor";
import OnboardingView from "@/components/onboarding/OnboardingView";
import type { Onboarding } from "@/components/onboarding/types";
import { api } from "@/lib/api";

interface Me {
  role: string;
  program_completed_at: string | null;
}

const ADMIN_ROLES = ["super_admin", "project_manager"];

const TITLE = "Zacznij tutaj";

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
  const [attempt, setAttempt] = useState(0);

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
          setLoadError("Nie udało się wczytać ekranu. Sprawdź połączenie i spróbuj ponownie.");
        }
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const isAdmin = useMemo(
    () => (role !== null ? ADMIN_ROLES.includes(role) : false),
    [role],
  );

  function retry() {
    setLoadError(null);
    setAttempt((n) => n + 1);
  }

  function startEditing() {
    setSaved(false);
    setEditing(true);
  }

  if (loadError) {
    return (
      <PageTemplate naglowek={{ title: TITLE }}>
        <ErrorState message={loadError} onRetry={retry} />
      </PageTemplate>
    );
  }

  if (!data) {
    return (
      <PageTemplate naglowek={{ title: TITLE }}>
        <LoadingState label="Wczytywanie ekranu startowego…" />
      </PageTemplate>
    );
  }

  if (editing) {
    return (
      <PageTemplate naglowek={{ title: "Edytuj ekran „Zacznij tutaj”" }}>
        <OnboardingEditor
          data={data}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            setData(updated);
            setSaved(true);
            setEditing(false);
          }}
        />
      </PageTemplate>
    );
  }

  return (
    <PageTemplate
      naglowek={{
        title: TITLE,
        action: isAdmin ? (
          <Button variant="secondary" onClick={startEditing}>
            <Pencil aria-hidden="true" />
            Edytuj treść
          </Button>
        ) : undefined,
      }}
    >
      {saved && <Alert variant="success">Zapisano treść ekranu.</Alert>}

      {programCompletedAt && (
        <Alert variant="info">
          Program ukończony {formatDateTime(programCompletedAt)}.{" "}
          <Link
            href="/panel/po-programie"
            className="inline-flex min-h-control items-center font-semibold text-info-dark underline underline-offset-4 focus-visible:focus-ring"
          >
            Przejdź do ekranu po programie
          </Link>
          .
        </Alert>
      )}

      {isAdmin && (
        <p className="text-caption text-muted">
          Ostatnia zmiana treści: {formatDateTime(data.updated_at)}
        </p>
      )}

      <OnboardingView data={data} />
    </PageTemplate>
  );
}
