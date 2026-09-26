"use client";

import { useEffect, useState } from "react";
import ErrorState from "@/components/molecules/ErrorState";
import ForbiddenState from "@/components/molecules/ForbiddenState";
import LoadingState from "@/components/molecules/LoadingState";
import PageTemplate from "@/components/templates/PageTemplate";
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
 * Ekran po ukończeniu programu — `GET /me`. `program_completed_at`
 * ustawione → status ukończenia + odnośniki do dokumentów, kursów i (dla
 * `volunteer`) certyfikatu. Puste → stan informacyjny bez odnośników.
 *
 * Formularz zgłoszenia dalszej współpracy nie jest tu budowany dlatego, że
 * ekrany są zamrożone do czasu przyjęcia makiet — a nie dlatego, że brakuje
 * tras. Trasy istnieją: `POST /cooperation-requests`,
 * `GET /cooperation-requests/mine` oraz dwie po stronie obsługi zgłoszeń
 * (`backend/routes/api/h01.php`).
 */
export default function PoProgramiePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /**
   * `GET /me` (`backend/routes/api/h01.php`) nie ma tu ani `role:`, ani
   * `access.active`, a `ProfileController::show` nie woła `authorize()` —
   * strażnik Keycloak przy złym tokenie rzuca 401 (`AuthenticateKeycloakToken`),
   * nie 403. `ApiExceptionRenderer` mapuje `AuthorizationException` i
   * `AccessDeniedHttpException` na 403 dla całego API, ale nic na tej trasie
   * dziś takiego wyjątku nie rzuca — ta gałąź jest tu obsługą zachowawczą,
   * której zaplecze w tym drzewie nie wytwarza.
   */
  const [forbidden, setForbidden] = useState(false);

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
          setForbidden(caught instanceof ApiError && caught.status === 403);
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
        setForbidden(caught instanceof ApiError && caught.status === 403);
        setLoadError(
          caught instanceof ApiError ? caught.message : LOAD_ERROR_MESSAGE,
        );
      })
      .finally(() => setLoading(false));
  }

  return (
    <PageTemplate naglowek={{ title: "Po programie" }}>
      {loading && <LoadingState label="Wczytywanie stanu programu…" />}
      {!loading && loadError && forbidden && (
        <ForbiddenState message="Nie masz uprawnień do wyświetlenia tego ekranu." />
      )}
      {!loading && loadError && !forbidden && (
        <ErrorState message={loadError} onRetry={retry} />
      )}

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
    </PageTemplate>
  );
}
