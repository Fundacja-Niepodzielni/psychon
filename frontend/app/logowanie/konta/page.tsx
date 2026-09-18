"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

/**
 * `/logowanie/konta` istniało jako drugie drzwi logowania (obok hasła
 * lokalnego). PsychON jest teraz wyłącznie SSO, więc `/logowanie` samo jest
 * ekranem logowania przez konto Niepodzielni — ta trasa zostaje tylko jako
 * przekierowanie dla starych linków (zakładek, maili), z zachowaniem
 * `?error=`, żeby nie zgubić komunikatu z callbacku Auth.js.
 */
function Redirector() {
  const router = useRouter();
  const params = useSearchParams();
  const error = params.get("error");

  useEffect(() => {
    router.replace(error ? `/logowanie?error=${encodeURIComponent(error)}` : "/logowanie");
  }, [error, router]);

  return <h1 className="text-small text-subtle">Przekierowuję…</h1>;
}

export default function AccountSystemLoginRedirect() {
  return (
    <main id="tresc" className="flex min-h-screen items-center justify-center bg-page p-6">
      <Suspense fallback={null}>
        <Redirector />
      </Suspense>
    </main>
  );
}
