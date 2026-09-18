"use client";

import { getSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import AuthTemplate from "@/components/templates/AuthTemplate";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
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

const NAGLOWEK = {
  title: "Zaloguj się",
  description: "Platforma szkoleniowa programu Niepodzielni. Logujesz się kontem Niepodzielni.",
};

const REDIRECTING = "Przekierowuję do logowania…";

/**
 * Limit czasu WŁASNY tego ekranu (`/logowanie`, nie `/logowanie/niepowiazane`):
 * jeżeli w tym czasie żaden z możliwych wyników (przekierowanie do logowania,
 * komunikat błędu, lądowanie wg roli) się nie rozstrzygnie, przestajemy czekać
 * i pokazujemy awaryjny komunikat zamiast trzymać „Przekierowuję…” bez końca
 * (zmierzone bez tego limitu: 30 015 ms, zero komunikatów, przy trzech
 * nieudanych pobraniach sesji, każde 500).
 *
 * Wartość dziś TAKA SAMA jak `KONTO_BINDING_LIMIT_MS` z `lib/api.ts` (ten sam
 * rząd wielkości uzasadnienia: zapas nad realną odpowiedzią sieci, wyraźnie
 * poniżej progu, po którym ekran zaczyna kłamać, że coś się jeszcze dzieje) —
 * ale to DWIE OSOBNE stałe dla DWÓCH OSOBNYCH ekranów. Nie importować i nie
 * aliasować `KONTO_BINDING_LIMIT_MS` tutaj: zmiana progu na ekranie
 * `/logowanie/niepowiazane` nie ma prawa przesunąć granicy czasu TEGO ekranu,
 * i odwrotnie.
 */
const LOGIN_TIMEOUT_MS = 8_000;

interface Me {
  role: string;
}

/**
 * PsychON jest wyłącznie SSO: to jedyne drzwi logowania, przez konto
 * Niepodzielni (Keycloak). PIĘĆ stanów, nie cztery, bez formularza:
 *
 * 1. Brak sesji i brak `?error=` → od razu `signIn("keycloak", …)`, zero
 *    kliknięć — użytkowniczka widzi tylko krótki komunikat o przekierowaniu.
 *    Gdy `signIn()` się ROZSTRZYGNIE (przeglądarka dostała polecenie
 *    nawigacji do Keycloak), zegar z punktu 5 jest zatrzymywany — inaczej,
 *    mimo powodzenia, po `LOGIN_TIMEOUT_MS` i tak wyskakiwał fałszywy
 *    komunikat awaryjny na ścieżce, która się udała (zmierzone testem, gdzie
 *    `signIn()` jest zamockowane i nie przerywa wykonania JS nawigacją, tak
 *    jak zrobiłaby to prawdziwa przeglądarka).
 * 2. `?error=` z callbacku Auth.js → komunikat po polsku i przycisk, od razu,
 *    zegar zatrzymany. ŻADNEGO automatycznego przekierowania tutaj — inaczej
 *    błąd logowania natychmiast uruchamiałby kolejną próbę i nigdy nie dałby
 *    się przeczytać (pętla).
 * 3. Sesja już żywa (np. powrót na `/logowanie` jako cel `callbackUrl` po
 *    udanym logowaniu) i `GET /me` się powodzi → lądowanie wg roli, zegar
 *    zatrzymany.
 * 4. Sesja już żywa, ale `GET /me` zawodzi: 401 jest obsłużony globalnie
 *    przez `lib/api.ts` (`handleUnauthorized`) — tu tylko milczymy, żeby nie
 *    zdążyć narysować błędu tuż przed przekierowaniem, które i tak zaraz
 *    nadejdzie (zegar zostaje jako siatka bezpieczeństwa, gdyby ten redirect
 *    nie nadszedł); inny błąd niż 401 → komunikat awaryjny od razu, zegar
 *    zatrzymany.
 * 5. Nic z powyższego nie rozstrzygnęło się do `LOGIN_TIMEOUT_MS` — czy to
 *    dlatego, że `getSession()`/`GET /me` wisi, czy dlatego, że samo
 *    rozpoczęcie logowania (`signIn()`) odrzuciło obietnicę → ekran przestaje
 *    czekać i pokazuje TEN SAM komunikat i przycisk co stan 2. Dlatego cała
 *    praca tego efektu, ŁĄCZNIE z wywołaniem `signIn()`, stoi w jednym
 *    `try`/`catch`: bez tego odrzucona obietnica `signIn()` nie miała nic,
 *    co złapałoby błąd, i ekran zostawał na „Przekierowuję…” bez granicy
 *    czasu. To DALEJ nie jest automatyczne ponowienie logowania — po
 *    zegarze/błędzie ekran CZEKA na kliknięcie, z tego samego powodu co
 *    w stanie 2: automatyczna kolejna próba nigdy nie dałaby się przeczytać.
 */
function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const errorCode = params.get("error");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Zegar tego ekranu: pierwsze rozstrzygnięcie wygrywa (ten sam wzorzec co
    // `sprawdzZLimitem` w `/logowanie/niepowiazane`). Każda gałąź `run()`,
    // która realnie coś rozstrzyga, sama go anuluje — jeśli żadna tego nie
    // zrobi do `LOGIN_TIMEOUT_MS`, to on decyduje.
    const zegar = setTimeout(() => {
      setErrorMessage(ERROR_MESSAGES.Configuration);
    }, LOGIN_TIMEOUT_MS);

    async function run() {
      try {
        const session = await getSession();
        if (cancelled) return;

        const loggedIn = Boolean(session?.user?.id) && !session?.error;

        if (loggedIn) {
          try {
            const me = await api<Me>("/me");
            if (cancelled) return;
            clearTimeout(zegar);
            router.replace(homeForRole(me.role));
          } catch (err) {
            if (cancelled) return;
            // 401 = albo „niepowiązane", albo „sesja wygasła" — obie ścieżki
            // `lib/api.ts` już zaczęło same, przekierowaniem przeglądarki.
            // Zegar zostaje włączony jako siatka bezpieczeństwa: gdyby ten
            // redirect nie nadszedł, ekran i tak nie zostanie bez końca.
            if (!(err instanceof ApiError && err.status === 401)) {
              clearTimeout(zegar);
              setErrorMessage("Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.");
            }
          }
          return;
        }

        if (errorCode) {
          clearTimeout(zegar);
          setErrorMessage(ERROR_MESSAGES[errorCode] ?? "Logowanie się nie powiodło. Spróbuj ponownie.");
          return;
        }

        // Ten `await` (zamiast odrzuconego wyniku) jest tu celowo: dopiero
        // dzięki niemu odrzucenie obietnicy `signIn()` trafia do `catch`
        // niżej, zamiast zostawiać ekran na komunikacie o przekierowaniu bez
        // granicy czasu.
        await signIn("keycloak", { callbackUrl: "/logowanie" });
        if (cancelled) return;
        // Sygnał powodzenia W TYM przepływie: `signIn()` się ROZSTRZYGNĘŁO
        // (nie odrzuciło) — to znaczy, że przeglądarka już dostała polecenie
        // przekierowania do Keycloak (w prawdziwej przeglądarce ten kod i tak
        // by nie doszedł, bo nawigacja przerywa wykonanie JS; zmierzone pod
        // testem, gdzie `signIn()` jest zamockowane i NIE nawiguje: bez tego
        // `clearTimeout` zegar strzelał mimo powodzenia i po `LOGIN_TIMEOUT_MS`
        // wieszał fałszywy komunikat awaryjny na ścieżce, która się udała).
        clearTimeout(zegar);
      } catch {
        if (cancelled) return;
        clearTimeout(zegar);
        setErrorMessage(ERROR_MESSAGES.Configuration);
      }
    }

    void run();
    return () => {
      cancelled = true;
      clearTimeout(zegar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!errorMessage) {
    return <AuthTemplate {...NAGLOWEK} waitingLabel={REDIRECTING} />;
  }

  return (
    <AuthTemplate {...NAGLOWEK}>
      <Alert variant="error">{errorMessage}</Alert>
      <Button
        type="button"
        onClick={() => void signIn("keycloak", { callbackUrl: "/logowanie" })}
      >
        <LogIn aria-hidden="true" />
        Zaloguj przez konto Niepodzielni
      </Button>
    </AuthTemplate>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthTemplate {...NAGLOWEK} waitingLabel={REDIRECTING} />}>
      <LoginScreen />
    </Suspense>
  );
}
