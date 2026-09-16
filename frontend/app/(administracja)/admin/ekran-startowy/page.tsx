"use client";

import { useEffect, useState } from "react";
import ErrorState from "@/components/molecules/ErrorState";
import ForbiddenState from "@/components/molecules/ForbiddenState";
import LoadingState from "@/components/molecules/LoadingState";
import PageHeader from "@/components/molecules/PageHeader";
import OnboardingEditor from "@/components/onboarding/OnboardingEditor";
import OnboardingView from "@/components/onboarding/OnboardingView";
import type { Onboarding } from "@/components/onboarding/types";
import { api, ApiError } from "@/lib/api";

const LOAD_ERROR_MESSAGE = "Nie udało się wczytać ekranu. Spróbuj ponownie.";

/**
 * Edycja treści ekranu „Zacznij tutaj" (H21) z panelu administracji —
 * `GET /onboarding` do wczytania, `PATCH /admin/onboarding` w `OnboardingEditor`.
 * Podgląd obok pokazuje ten sam render, który zobaczy uczestnik na `/panel/start`.
 */
export default function AdminOnboardingPage() {
  const [data, setData] = useState<Onboarding | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorStatus, setLoadErrorStatus] = useState<number | undefined>();

  // Fetch-on-mount jako łańcuch obietnic (bez synchronicznego setState przed
  // pierwszym `await`) — wzorzec z `panel/dokumenty/page.tsx`, wymagany przez
  // `react-hooks/set-state-in-effect`.
  useEffect(() => {
    let cancelled = false;
    api<Onboarding>("/onboarding")
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setLoadError(
            caught instanceof ApiError ? caught.message : LOAD_ERROR_MESSAGE,
          );
          setLoadErrorStatus(caught instanceof ApiError ? caught.status : undefined);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Ponowienie z przycisku `ErrorState` — poza efektem, więc reset stanu na
  // początku jest w porządku (to zwykły handler zdarzenia, nie ciało efektu).
  function retry() {
    setLoading(true);
    setLoadError(null);
    setLoadErrorStatus(undefined);
    api<Onboarding>("/onboarding")
      .then((result) => setData(result))
      .catch((caught: unknown) => {
        setLoadError(
          caught instanceof ApiError ? caught.message : LOAD_ERROR_MESSAGE,
        );
        setLoadErrorStatus(caught instanceof ApiError ? caught.status : undefined);
      })
      .finally(() => setLoading(false));
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Ekran startowy"
        description="Treść ekranu „Zacznij tutaj”, który uczestnicy widzą po zalogowaniu."
      />

      {loading && <LoadingState label="Wczytywanie ekranu startowego…" />}
      {!loading && loadError && loadErrorStatus === 403 && (
        <ForbiddenState />
      )}
      {!loading && loadError && loadErrorStatus !== 403 && (
        <ErrorState message={loadError} onRetry={retry} />
      )}

      {!loading && !loadError && data && (
        <>
          <OnboardingEditor data={data} onSaved={setData} />

          <div className="flex flex-col gap-4">
            <h2 className="text-h4 font-bold text-ink">Podgląd</h2>
            <OnboardingView data={data} />
          </div>
        </>
      )}
    </div>
  );
}
