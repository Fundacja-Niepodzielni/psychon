"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { endSession } from "@/lib/api";

/**
 * Cel przekierowania z `lib/api.ts` (`handleUnauthorized`) dla ważnej sesji
 * konta Niepodzielni, której `sub` nie jest jeszcze powiązany z żadnym
 * kontem PsychON — `GET /me` odpowiada 401, a `GET /sso/whoami` na tym samym
 * tokenie 200. Sesja tutaj NIE jest kończona automatycznie: dopiero przycisk
 * niżej ją zamyka, tym samym wzorcem co `/konto` (adres wylogowania Kont
 * czytany przed zakończeniem sesji aplikacji).
 */
export default function NiepowiazanePage() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

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
            <Alert variant="error">
              Twoje konto Niepodzielni zalogowało się poprawnie, ale nie jest jeszcze
              powiązane z żadnym kontem w PsychON. Użyj linku z zaproszenia, żeby
              powiązać konto, albo skontaktuj się z opiekunem projektu.
            </Alert>
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
