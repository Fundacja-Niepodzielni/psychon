"use client";

import { useEffect, useState } from "react";
import Forbidden403 from "@/components/permissions/Forbidden403";
import { api, ApiError } from "@/lib/api";

export type Role =
  | "super_admin"
  | "project_manager"
  | "instructor"
  | "volunteer"
  | "student";

interface MeResponse {
  role: Role;
}

export interface RequireRoleProps {
  /** Role dopuszczone do tej trasy (docs/system/03-role-i-uprawnienia.md §2). */
  allowedRoles: Role[];
  /** Nadpisanie domyślnego tekstu `Forbidden403` szablonem ze słownika interfejsu
   * (B7 w. 3: „Ta funkcja jest dostępna tylko dla {rola}.”), gdy karta ekranu go wymaga. */
  deniedMessage?: string;
  children: React.ReactNode;
}

type GuardState =
  | { status: "loading" }
  | { status: "allowed" }
  | { status: "denied"; role: Role }
  | { status: "error" };

/**
 * H02 · Klientowy strażnik nawigacji wg roli (moduł M2). Serwer i tak
 * odrzuca każde żądanie API spoza dozwolonej roli (§1: "nawigacja i strażnicy
 * w przeglądarce tylko poprawiają wygodę") — to tylko blokuje wyświetlenie
 * panelu przy ręcznym wejściu pod adres, zamiast pokazywać pusty/zepsuty
 * ekran, który i tak zacząłby dostawać same 403 z API.
 */
export default function RequireRole({ allowedRoles, deniedMessage, children }: RequireRoleProps) {
  const [state, setState] = useState<GuardState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    api<MeResponse>("/me")
      .then((me) => {
        if (cancelled) return;
        setState(
          allowedRoles.includes(me.role)
            ? { status: "allowed" }
            : { status: "denied", role: me.role },
        );
      })
      .catch((err) => {
        if (cancelled) return;
        // 401 czyści token i przekierowuje na /logowanie wewnątrz lib/api.ts.
        if (err instanceof ApiError && err.status === 401) return;
        setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
    // allowedRoles to literał tworzony na nowo przy każdym renderze layoutu —
    // celowo poza tablicą zależności, żeby nie odpytywać /me w kółko.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        {/* Ten strażnik renderuje się PRZED szablonem strony (który
         * dopiero niesie własny `h1` przez `PageHeader`), więc bez własnego
         * `h1` stan pośredni (ładowanie roli) nie ma żadnego nagłówka
         * głównego — a to stan, w którym realnie ktoś może wylądować
         * (wolne łącze, wolne API `/me`), nie tylko migawka między klatkami. */}
        <h1 className="text-body text-subtle">Wczytywanie…</h1>
      </div>
    );
  }

  if (state.status === "denied") {
    return (
      <Forbidden403
        reason={{ required_roles: allowedRoles, your_role: state.role }}
        message={deniedMessage}
      />
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-page p-6 text-center">
        {/* Jak wyżej przy stanie "loading" — bez własnego `h1` ten
         * ekran (backend nieosiągalny) nie miał żadnego nagłówka głównego. */}
        <h1 className="text-h3 font-bold text-ink">Błąd połączenia</h1>
        <p className="text-body text-subtle">
          Nie udało się połączyć z serwerem. Sprawdź, czy backend działa.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
