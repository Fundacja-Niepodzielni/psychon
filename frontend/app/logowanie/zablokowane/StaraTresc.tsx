"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import PublicPageTemplate from "@/components/templates/PublicPageTemplate";
import { endSession } from "@/lib/api";

/**
 * Cel przekierowania z `lib/api/logowanie.ts` (`handleUnauthorized`) dla ważnej
 * sesji konta Niepodzielni, której konto w PsychON jest zablokowane — serwer
 * odpowiada wtedy 401 z kodem `konto_zablokowane` (ta sama koperta co przy
 * `konto_niepowiazane`, bez `reason`). Wariant ekranu `/logowanie/niepowiazane`:
 * ten sam szablon i te same komponenty, inna treść, bez przełącznika.
 *
 * Ekran mówi tylko o stanie konta. Powód blokady nigdy tu nie trafia: żyje w
 * rekordzie i w dzienniku administracji, a odpowiedź serwera go nie niesie.
 * Samo wejście na ekran nie woła żadnego API. Sesja
 * nie jest kończona automatycznie — dopiero przycisk „Wyloguj się” ją zamyka, tym
 * samym wzorcem co `/logowanie/niepowiazane` i `/konto` (adres wylogowania Kont
 * czytany przed zakończeniem sesji aplikacji). Po odblokowaniu wystarczy wejść
 * na `/logowanie`: ta sama sesja przechodzi dalej.
 */
export default function ZablokowanePage() {
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
    <PublicPageTemplate naglowek={{ title: "Konto jest zablokowane" }}>
      <div className="w-full max-w-md">
        <Card>
          <div className="flex flex-col gap-4">
            <Alert variant="error">
              Nie możesz teraz korzystać z platformy. Jeśli to pomyłka, skontaktuj się z fundacją.
            </Alert>
            <Button
              type="button"
              variant="primary"
              className="w-full"
              loading={signingOut}
              onClick={() => void logout()}
            >
              Wyloguj się
            </Button>
          </div>
        </Card>
      </div>
    </PublicPageTemplate>
  );
}
