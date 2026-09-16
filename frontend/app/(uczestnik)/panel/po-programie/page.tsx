"use client";

import { useEffect, useState } from "react";
import ErrorState from "@/components/molecules/ErrorState";
import LoadingState from "@/components/molecules/LoadingState";
import PageHeader from "@/components/molecules/PageHeader";
import ProgramCompletedCard from "@/components/po-programie/ProgramCompletedCard";
import ProgramPendingCard from "@/components/po-programie/ProgramPendingCard";
import { api, ApiError } from "@/lib/api";
import type { Role } from "@/lib/home-by-role";

interface Me {
  role: Role;
  program_completed_at: string | null;
}

const LOAD_ERROR_MESSAGE = "Nie udało się wczytać ekranu. Spróbuj ponownie.";

/**
 * Ekran po ukończeniu programu (poz. 8) — `GET /me`. `program_completed_at`
 * ustawione → status ukończenia + odnośniki do dokumentów, kursów i (dla
 * `volunteer`) certyfikatu. Puste → stan informacyjny bez odnośników;
 * zgłoszenie dalszej współpracy nie jest tu budowane — backend go jeszcze
 * nie ma (brak dla lidera w zleceniu).
 */
export default function PoProgramiePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fetch-on-mount jako łańcuch obietnic (bez synchronicznego setState przed
  // pierwszym `await`) — wzorzec z `panel/dokumenty/page.tsx`, wymagany przez
  // `react-hooks/set-state-in-effect`.
  useEffect(() => {
    let cancelled = false;
    api<Me>("/me")
      .then((result) => {
        if (!cancelled) setMe(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setLoadError(
            caught instanceof ApiError ? caught.message : LOAD_ERROR_MESSAGE,
          );
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
    api<Me>("/me")
      .then((result) => setMe(result))
      .catch((caught: unknown) => {
        setLoadError(
          caught instanceof ApiError ? caught.message : LOAD_ERROR_MESSAGE,
        );
      })
      .finally(() => setLoading(false));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Po programie" />

      {loading && <LoadingState label="Wczytywanie stanu programu…" />}
      {!loading && loadError && <ErrorState message={loadError} onRetry={retry} />}

      {!loading && !loadError && me && (
        me.program_completed_at ? (
          <ProgramCompletedCard
            completedAt={me.program_completed_at}
            role={me.role}
          />
        ) : (
          <ProgramPendingCard />
        )
      )}
    </div>
  );
}
