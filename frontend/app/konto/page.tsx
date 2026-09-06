"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { ApiError, clearToken, fetchWhoAmI, type WhoAmI } from "@/lib/api";

/**
 * Landing screen for the account-system sign-in door. Calls
 * `GET /api/v1/sso/whoami` — the identity and roles shown here come straight
 * from that response, i.e. from the token, never from a local table.
 */
export default function AccountPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<WhoAmI | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  const load = useCallback(
    () =>
      fetchWhoAmI()
        .then((data) => {
          setIdentity(data);
          setError(null);
        })
        .catch((err) => {
          setIdentity(null);
          setError(
            err instanceof ApiError
              ? `${err.message} (kod: ${err.code})`
              : "Nie udało się połączyć z serwerem.",
          );
        })
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } finally {
      clearToken();
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
          {loading && <p className="text-small text-subtle">Wczytywanie…</p>}

          {!loading && error && <Alert variant="error">{error}</Alert>}

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
