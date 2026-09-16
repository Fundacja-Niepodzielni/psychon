"use client";

import { getSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { api, ApiError } from "@/lib/api";
import { homeForRole } from "@/lib/home-by-role";

interface PowiazaneKonto {
  role: string;
}

type Stan =
  | { krok: "sprawdzanie" }
  | { krok: "brak-sesji" }
  | { krok: "wiazanie" }
  | { krok: "sukces" }
  | { krok: "blad"; komunikat: string };

/**
 * `/aktywacja?token=…` wiąże `sub` konta Niepodzielni z użytkownikiem
 * zaproszonym do PsychON — `POST /sso/powiaz` (kontrakt: `SsoBindController`).
 * Bez sesji: przycisk logowania przez konto Niepodzielni, z powrotem na ten
 * sam adres (token zostaje w URL). Z sesją: wiązanie od razu, bez żadnego
 * hasła — konto nie ma go w ogóle, jest tylko `sub` z tokenu.
 */
function AktywacjaTresc() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [stan, setStan] = useState<Stan>({ krok: "sprawdzanie" });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const session = await getSession();
      if (cancelled) return;

      const zalogowana = Boolean(session?.user?.id) && !session?.error;
      if (!zalogowana) {
        setStan({ krok: "brak-sesji" });
        return;
      }

      if (!token) {
        setStan({ krok: "blad", komunikat: "Link aktywacyjny nie zawiera tokenu." });
        return;
      }

      setStan({ krok: "wiazanie" });
      try {
        const user = await api<PowiazaneKonto>("/sso/powiaz", {
          method: "POST",
          body: { token },
        });
        if (cancelled) return;
        setStan({ krok: "sukces" });
        router.replace(homeForRole(user.role));
      } catch (err) {
        if (cancelled) return;
        // 401 = sesja się skończyła w międzyczasie — `lib/api.ts` już
        // przekierowuje samo, nie ma czego tu jeszcze rysować.
        if (err instanceof ApiError && err.status === 401) return;
        const komunikat =
          err instanceof ApiError
            ? err.message
            : "Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.";
        setStan({ krok: "blad", komunikat });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (stan.krok === "brak-sesji") {
    return (
      <Card title="Aktywacja konta" className="w-full max-w-lg">
        <p className="mb-5 text-body text-muted">
          Zaloguj się przez konto Niepodzielni, aby powiązać je z tym zaproszeniem.
        </p>
        <Button
          type="button"
          onClick={() =>
            void signIn("keycloak", {
              callbackUrl: `/aktywacja?token=${encodeURIComponent(token)}`,
            })
          }
        >
          Zaloguj przez konto Niepodzielni
        </Button>
      </Card>
    );
  }

  if (stan.krok === "blad") {
    return (
      <Card title="Aktywacja konta" className="w-full max-w-lg">
        <Alert variant="error">{stan.komunikat}</Alert>
      </Card>
    );
  }

  return (
    <Card title="Aktywacja konta" className="w-full max-w-lg">
      <p className="text-body text-muted">
        {stan.krok === "sukces" ? "Konto powiązane. Przekierowuję…" : "Trwa łączenie konta…"}
      </p>
    </Card>
  );
}

export default function ActivationPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-page p-6">
      <div className="flex w-full max-w-lg flex-col gap-4">
        <h1 className="text-h2 font-black text-ink">Aktywacja konta</h1>
        <Suspense fallback={<p className="text-body text-subtle">Wczytywanie…</p>}>
          <AktywacjaTresc />
        </Suspense>
      </div>
    </main>
  );
}
