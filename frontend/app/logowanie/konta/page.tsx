"use client";

import { signIn } from "next-auth/react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Alert from "@/components/ui/Alert";
import Card from "@/components/ui/Card";

/** Human-readable text for the Auth.js error codes the callback can redirect
 * back here with (`?error=`). Anything not listed here still shows, just
 * untranslated — this is a thin verification screen, not a full error-copy
 * catalogue. */
const ERROR_MESSAGES: Record<string, string> = {
  OAuthCallbackError: "Konto Niepodzielni nie potwierdziło logowania. Spróbuj ponownie.",
  OAuthSignInError: "Nie udało się rozpocząć logowania przez Konta Niepodzielni.",
  AccessDenied: "Logowanie zostało anulowane.",
  Configuration: "Logowanie jest chwilowo niedostępne. Spróbuj ponownie później.",
};

/** `useSearchParams()` opts the page into client-side rendering, so Next
 * requires a `Suspense` boundary around it — split out just for that. */
function ErrorNotice() {
  const params = useSearchParams();
  const error = params.get("error");
  if (!error) return null;
  return (
    <Alert variant="error">
      {ERROR_MESSAGES[error] ?? "Logowanie się nie powiodło. Spróbuj ponownie."}
    </Alert>
  );
}

/**
 * Second sign-in door: the browser authenticates through the Foundation's
 * account system (Konta Niepodzielni) instead of this app's own
 * `/auth/login`. The existing `/logowanie` screen and its own sign-in stay
 * exactly as they are — this is a separate route, not a change to that one.
 */
export default function AccountSystemLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span
            aria-hidden="true"
            className="mx-auto flex size-12 items-center justify-center rounded-md bg-brand text-h3 font-black text-light"
          >
            N
          </span>
          <h1 className="mt-3 text-h2 font-black text-ink">Niepodzielni</h1>
          <p className="mt-1 text-small text-subtle">
            Zaloguj się przez Konta Niepodzielni
          </p>
        </div>

        <Card>
          <div className="flex flex-col gap-4">
            <Suspense fallback={null}>
              <ErrorNotice />
            </Suspense>
            <p className="text-small text-subtle">
              Zostaniesz przekierowany na stronę logowania konta Fundacji Niepodzielni.
            </p>
            <button
              type="button"
              onClick={() => void signIn("keycloak", { callbackUrl: "/konto" })}
              className="inline-flex items-center justify-center gap-2 rounded-pill bg-primary px-6 py-2.5 text-body font-medium text-light transition-colors duration-200 hover:bg-ink focus-visible:focus-ring"
            >
              Zaloguj się przez Konta Niepodzielni
            </button>
          </div>
        </Card>

        <p className="mt-4 text-center text-caption text-subtle">
          Masz konto lokalne?{" "}
          <a href="/logowanie" className="underline">
            Zaloguj się hasłem
          </a>
          .
        </p>
      </div>
    </div>
  );
}
