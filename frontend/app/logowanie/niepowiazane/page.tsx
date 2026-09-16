"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { checkAccountBinding, endSession } from "@/lib/api";

/**
 * Cel przekierowania z `lib/api.ts` (`handleUnauthorized`) dla ważnej sesji
 * konta Niepodzielni, której `sub` nie jest jeszcze powiązany z żadnym
 * kontem PsychON — `GET /me` odpowiada 401, a `GET /sso/whoami` na tym samym
 * tokenie 200. Sesja tutaj NIE jest kończona automatycznie: dopiero przycisk
 * niżej ją zamyka, tym samym wzorcem co `/konto` (adres wylogowania Kont
 * czytany przed zakończeniem sesji aplikacji).
 *
 * Identyfikator do przekazania administratorowi (`ZLECENIE-125`): sprawdzony
 * przez `checkAccountBinding()` po zamontowaniu ekranu — dopiero WTEDY, gdy
 * odpowiedź niesie `error.code === "konto_niepowiazane"` razem z
 * `error.reason.sub`, pokazujemy go z przyciskiem Kopiuj. Odpowiedź BEZ
 * `sub` (token nieważny, `error.code === "unauthenticated"`) zostawia ekran
 * dotychczasowy — bez miejsca na identyfikator i bez przycisku.
 */
export default function NiepowiazanePage() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [sub, setSub] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void checkAccountBinding().then((result) => {
      if (!cancelled && result?.code === "konto_niepowiazane" && result.sub) {
        setSub(result.sub);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function copyIdentifier() {
    if (!sub) return;
    await navigator.clipboard.writeText(sub);
  }

  async function logout() {
    setSigningOut(true);
    try {
      const res = await fetch("/api/auth/end-session-url");
      const { url } = (await res.json()) as { url: string };
      await endSession();
      window.location.assign(url);
    } catch {
      await endSession();
      setSigningOut(false);
      router.push("/logowanie");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-h2 font-black text-ink">Konto nie jest jeszcze połączone</h1>
        </div>

        <Card>
          <div className="flex flex-col gap-4">
            {sub ? (
              <Alert variant="error">
                <p>
                  Twoje konto Niepodzielni nie jest jeszcze powiązane z PsychON. Przekaż
                  administratorowi ten identyfikator:
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="break-all rounded-sm bg-card px-2 py-1 text-small">{sub}</code>
                  <Button type="button" variant="secondary" onClick={() => void copyIdentifier()}>
                    Kopiuj
                  </Button>
                </div>
              </Alert>
            ) : (
              <Alert variant="error">
                Twoje konto Niepodzielni zalogowało się poprawnie, ale nie jest jeszcze
                powiązane z żadnym kontem w PsychON. Użyj linku z zaproszenia, żeby
                powiązać konto, albo skontaktuj się z opiekunem projektu.
              </Alert>
            )}
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              loading={signingOut}
              onClick={() => void logout()}
            >
              Wyloguj
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
