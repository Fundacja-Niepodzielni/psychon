"use client";

import { getSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { api, ApiError } from "@/lib/api";
import { homeForRole } from "@/lib/home-by-role";

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

interface Me {
  role: string;
}

/**
 * PsychON jest wyłącznie SSO: to jedyne drzwi logowania, przez konto
 * Niepodzielni (Keycloak). Trzy stany, bez formularza:
 *
 * 1. Brak sesji i brak `?error=` → od razu `signIn("keycloak", …)`, zero
 *    kliknięć — użytkowniczka widzi tylko krótki komunikat o przekierowaniu.
 * 2. `?error=` z callbacku Auth.js → komunikat po polsku i przycisk. ŻADNEGO
 *    automatycznego przekierowania tutaj — inaczej błąd logowania natychmiast
 *    uruchamiałby kolejną próbę i nigdy nie dałby się przeczytać (pętla).
 * 3. Sesja już żywa (np. powrót na `/logowanie` jako cel `callbackUrl` po
 *    udanym logowaniu) → `GET /me` i lądowanie wg roli. 401 z `/me` jest
 *    obsłużony globalnie przez `lib/api.ts` (`handleUnauthorized`) — tu tylko
 *    milczymy, żeby nie zdążyć narysować błędu tuż przed przekierowaniem,
 *    które i tak zaraz nadejdzie.
 */
function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const errorCode = params.get("error");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const session = await getSession();
      if (cancelled) return;

      const loggedIn = Boolean(session?.user?.id) && !session?.error;

      if (loggedIn) {
        try {
          const me = await api<Me>("/me");
          if (!cancelled) router.replace(homeForRole(me.role));
        } catch (err) {
          if (cancelled) return;
          // 401 = albo „niepowiązane", albo „sesja wygasła" — obie ścieżki
          // `lib/api.ts` już zaczęło same, przekierowaniem przeglądarki.
          if (!(err instanceof ApiError && err.status === 401)) {
            setErrorMessage("Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.");
          }
        }
        return;
      }

      if (errorCode) {
        setErrorMessage(ERROR_MESSAGES[errorCode] ?? "Logowanie się nie powiodło. Spróbuj ponownie.");
        return;
      }

      void signIn("keycloak", { callbackUrl: "/logowanie" });
    }

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            Platforma szkoleniowa programu Niepodzielni
          </p>
        </div>

        <Card>
          {errorMessage ? (
            <div className="flex flex-col gap-4">
              <Alert variant="error">{errorMessage}</Alert>
              <Button
                type="button"
                className="w-full"
                onClick={() => void signIn("keycloak", { callbackUrl: "/logowanie" })}
              >
                Zaloguj przez konto Niepodzielni
              </Button>
            </div>
          ) : (
            <p className="text-small text-subtle">Przekierowuję do logowania…</p>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-page p-6">
          <p className="text-small text-subtle">Przekierowuję do logowania…</p>
        </div>
      }
    >
      <LoginScreen />
    </Suspense>
  );
}
