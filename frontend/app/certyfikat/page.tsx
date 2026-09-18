"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import VerificationCard, {
  type VerifyResult,
} from "@/components/certyfikat/VerificationCard";
import Alert from "@/components/ui/Alert";
import ErrorState from "@/components/molecules/ErrorState";
import LoadingState from "@/components/molecules/LoadingState";
import { api, ApiError } from "@/lib/api";

type State =
  | { phase: "loading" }
  | { phase: "ok"; result: VerifyResult }
  | { phase: "not_found" }
  | { phase: "error" };

function CertificateLanding() {
  const params = useSearchParams();
  const token = params.get("token");
  const number = params.get("number");
  const path = token
    ? `/verify/qr/${token}`
    : number
      ? `/verify/${number}`
      : null;

  const [state, setState] = useState<State>({ phase: "loading" });
  const [ponowienie, setPonowienie] = useState(0);

  useEffect(() => {
    if (!path) return;

    let active = true;
    api<VerifyResult>(path)
      .then((result) => {
        if (active) setState({ phase: "ok", result });
      })
      .catch((err) => {
        if (!active) return;
        // 404 (numer/token nieznany) — komunikat „nie znaleziono"; każda inna
        // odpowiedź (5xx, sieć) — osobny komunikat awarii z ponowieniem.
        if (err instanceof ApiError && err.status === 404) {
          setState({ phase: "not_found" });
        } else {
          setState({ phase: "error" });
        }
      });
    return () => {
      active = false;
    };
  }, [path, ponowienie]);

  return (
    <main id="tresc" className="flex min-h-screen items-center justify-center bg-page p-6">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="text-h2 font-black text-ink">Certyfikat programu</h1>
          <p className="mt-1 text-small text-subtle">
            Fundacja Niepodzielni — program PsychON
          </p>
        </div>

        {path === null ? (
          <Alert variant="info">
            Brak numeru certyfikatu w adresie. Przejdź do{" "}
            <Link
              href="/weryfikacja"
              className="font-medium underline underline-offset-4"
            >
              wyszukiwarki weryfikacji
            </Link>
            .
          </Alert>
        ) : (
          <>
            {state.phase === "loading" && <LoadingState label="Sprawdzanie…" />}
            {state.phase === "ok" && (
              <VerificationCard result={state.result} />
            )}
            {state.phase === "not_found" && (
              <Alert variant="error">
                Nie znaleziono certyfikatu o podanym numerze.
              </Alert>
            )}
            {state.phase === "error" && (
              <ErrorState
                message="Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę."
                onRetry={() => {
                  setState({ phase: "loading" });
                  setPonowienie((n) => n + 1);
                }}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default function CertificateLandingPage() {
  return (
    <Suspense
      fallback={<p className="p-6 text-body text-muted">Wczytywanie…</p>}
    >
      <CertificateLanding />
    </Suspense>
  );
}
