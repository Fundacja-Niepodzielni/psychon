"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ErrorState from "@/components/molecules/ErrorState";
import ForbiddenState from "@/components/molecules/ForbiddenState";
import LoadingState from "@/components/molecules/LoadingState";
import { ApiError, endSession, fetchWhoAmI, type WhoAmI } from "@/lib/api";

type Usterka =
  | { rodzaj: "sesja"; komunikat: string }
  | { rodzaj: "odmowa"; komunikat: string }
  | { rodzaj: "awaria"; komunikat: string };

/**
 * Landing screen for the account-system sign-in door. Calls
 * `GET /api/v1/sso/whoami` — the identity and roles shown here come straight
 * from that response, i.e. from the token, never from a local table.
 */
export default function AccountPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<WhoAmI | null>(null);
  const [usterka, setUsterka] = useState<Usterka | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  const load = useCallback(
    () =>
      fetchWhoAmI()
        .then((data) => {
          setIdentity(data);
          setUsterka(null);
        })
        .catch((err) => {
          setIdentity(null);
          if (err instanceof ApiError && err.status === 401) {
            // 401 zostaje jak dziś: komunikat sesji, bez ponowienia.
            setUsterka({ rodzaj: "sesja", komunikat: `${err.message} (kod: ${err.code})` });
          } else if (err instanceof ApiError && err.status === 403) {
            // Odmowa roli — nigdy nie wygląda jak awaria, więc bez przycisku ponowienia.
            setUsterka({ rodzaj: "odmowa", komunikat: err.message });
          } else {
            // 500 i awaria sieci: to samo zdanie co dziś, ale z możliwością ponowienia.
            setUsterka({
              rodzaj: "awaria",
              komunikat:
                err instanceof ApiError
                  ? `${err.message} (kod: ${err.code})`
                  : "Nie udało się połączyć z serwerem.",
            });
          }
        })
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function ponowUsterke() {
    setLoading(true);
    void load();
  }

  async function signOut() {
    setSigningOut(true);
    try {
      // Read the IdP's own logout URL *before* ending the app's session —
      // it carries the `id_token_hint` read from this session's cookie,
      // which is gone the moment `endSession()` below returns.
      const res = await fetch("/api/auth/end-session-url");
      const { url } = (await res.json()) as { url: string };
      await endSession();
      // A full-page navigation, not a fetch: the realm's own SSO cookie is
      // HttpOnly on its own origin and only a real navigation clears it.
      // Ending here at `/konto` (client-side router.push) left it standing —
      // clicking the door again reused it silently, without asking for a password.
      window.location.assign(url);
    } catch {
      await endSession();
      setSigningOut(false);
      router.push("/logowanie/konta");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-h2 font-black text-ink">Twoje konto</h1>
        </div>

        <Card>
          {loading && <LoadingState label="Wczytywanie…" />}

          {!loading && usterka?.rodzaj === "sesja" && (
            <Alert variant="error">{usterka.komunikat}</Alert>
          )}

          {!loading && usterka?.rodzaj === "odmowa" && (
            <ForbiddenState message={usterka.komunikat} />
          )}

          {!loading && usterka?.rodzaj === "awaria" && (
            <ErrorState message={usterka.komunikat} onRetry={ponowUsterke} />
          )}

          {!loading && identity && (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-caption text-subtle">Identyfikator (sub)</p>
                <p className="break-all font-mono text-small text-ink">{identity.sub}</p>
              </div>
              <div>
                <p className="mb-1 text-caption text-subtle">Role z tokenu</p>
                {identity.roles.length === 0 ? (
                  <p className="text-small text-subtle">Brak ról — to również jest poprawny stan.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {identity.roles.map((role) => (
                      <Badge key={role}>{role}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <Button
            variant="secondary"
            className="mt-6 w-full"
            loading={signingOut}
            onClick={() => void signOut()}
          >
            Wyloguj
          </Button>
        </Card>
      </div>
    </div>
  );
}
