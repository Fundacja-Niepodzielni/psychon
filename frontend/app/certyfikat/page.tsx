"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import VerificationCard, {
  type VerifyResult,
} from "@/components/certyfikat/VerificationCard";
import Alert from "@/components/ui/Alert";
import { api } from "@/lib/api";

type State =
  | { phase: "loading" }
  | { phase: "ok"; result: VerifyResult }
  | { phase: "not_found" };

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

  useEffect(() => {
    if (!path) return;

    let active = true;
    api<VerifyResult>(path)
      .then((result) => {
        if (active) setState({ phase: "ok", result });
      })
      .catch(() => {
        if (active) setState({ phase: "not_found" });
      });
    return () => {
      active = false;
    };
  }, [path]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-6">
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
            {state.phase === "loading" && (
              <p className="text-center text-body text-muted">Sprawdzanie…</p>
            )}
            {state.phase === "ok" && (
              <VerificationCard result={state.result} />
            )}
            {state.phase === "not_found" && (
              <Alert variant="error">
                Nie znaleziono certyfikatu o podanym numerze.
              </Alert>
            )}
          </>
        )}
      </div>
    </div>
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
