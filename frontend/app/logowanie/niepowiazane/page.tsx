"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import {
  checkAccountBinding,
  endSession,
  KONTO_BINDING_AWARIA,
  KONTO_BINDING_LIMIT_MS,
  type AccountBindingCheck,
} from "@/lib/api";

/**
 * Cel przekierowania z `lib/api.ts` (`handleUnauthorized`) dla ważnej sesji
 * konta Niepodzielni, której `sub` nie jest jeszcze powiązany z żadnym
 * kontem PsychON — `GET /me` odpowiada 401, a `GET /sso/whoami` na tym samym
 * tokenie 200. Sesja tutaj NIE jest kończona automatycznie: dopiero przycisk
 * niżej ją zamyka, tym samym wzorcem co `/konto` (adres wylogowania Kont
 * czytany przed zakończeniem sesji aplikacji).
 *
 * Ekran mówi wyłącznie to, co w danej chwili wie, i dlatego ma cztery stany,
 * a nie trzy. Zaraz po zamontowaniu o powiązaniu konta nie wiadomo NIC —
 * odpowiedź jeszcze nie wróciła — więc widać „Sprawdzam stan Twojego konta…”, a nie zdanie
 * o braku powiązania. Tamto zdanie jest twierdzeniem i pojawia się dopiero
 * wtedy, kiedy jest prawdziwe: po odpowiedzi 401 BEZ `error.reason.sub`
 * (token nieważny, `error.code === "unauthenticated"`). Odpowiedź 401
 * Z `error.reason.sub` daje identyfikator do przekazania administratorowi,
 * razem z przyciskiem Kopiuj.
 *
 * Awaria zapytania: gdy `checkAccountBinding()` w ogóle nie dostanie
 * czytelnej odpowiedzi 401 (sieć, 5xx, przekroczony limit czasu), ekran
 * pokazuje osobny, krótki komunikat o chwilowej awarii z przyciskiem
 * ponowienia, a NIE zdanie o braku powiązania (to kłamałoby o przyczynie).
 * Ponowienie jest wyłącznie na kliknięcie: żadnego automatycznego
 * ponawiania w pętli przy trwałej awarii.
 *
 * Limit czasu (`KONTO_BINDING_LIMIT_MS`) jest tutaj, a nie tylko przy samym
 * `fetch`, bo wisieć może każdy człon łańcucha (odczyt tokena sesji, sieć,
 * serwer bez odpowiedzi). Po jego upływie ekran przerywa zapytanie i
 * pokazuje awarię, a spóźniona odpowiedź NIE nadpisuje już tego stanu.
 *
 * Cała zmienna część ekranu leży w jednym obszarze `aria-live="polite"`,
 * żeby przejście z „Sprawdzam stan Twojego konta…” do wyniku było dla czytnika ekranu ogłoszone,
 * a nie tylko narysowane.
 */
type StanEkranu =
  | { rodzaj: "sprawdzanie" }
  | { rodzaj: "identyfikator"; sub: string }
  | { rodzaj: "brak-powiazania" }
  | { rodzaj: "awaria" };

/**
 * Sprawdzenie z własnym limitem czasu: pierwsze rozstrzygnięcie wygrywa.
 * Po upływie limitu zapytanie jest przerywane (`AbortController`), a wynik
 * to awaria — obietnica jest już rozstrzygnięta, więc spóźniona odpowiedź
 * nie ma jak wrócić na ekran.
 */
function sprawdzZLimitem(): Promise<AccountBindingCheck | null> {
  const przerwanie = new AbortController();
  return new Promise((resolve) => {
    const zegar = setTimeout(() => {
      przerwanie.abort();
      resolve({ code: KONTO_BINDING_AWARIA });
    }, KONTO_BINDING_LIMIT_MS);

    void checkAccountBinding(przerwanie.signal).then(
      (result) => {
        clearTimeout(zegar);
        resolve(result);
      },
      () => {
        clearTimeout(zegar);
        resolve({ code: KONTO_BINDING_AWARIA });
      },
    );
  });
}

/**
 * Odpowiedź sprawdzenia → stan ekranu. Jedyne miejsce, gdzie to przejście żyje.
 *
 * `result === null` oznacza, że `checkAccountBinding` nie ma nic do powiedzenia
 * o powiązaniu (brak tokenu, albo `GET /me` odpowiedziało 2xx — czyli konto
 * JEST powiązane). Żadna z tych sytuacji nie uzasadnia zdania „konto nie jest
 * powiązane", więc ekran idzie w tę samą gałąź, co awaria sieci: mówi, że nie
 * potrafi tego rozstrzygnąć, i daje przycisk „spróbuj ponownie".
 */
function stanZWyniku(result: AccountBindingCheck | null): StanEkranu {
  if (result === null) return { rodzaj: "awaria" };
  if (result.code === "konto_niepowiazane" && result.sub) {
    return { rodzaj: "identyfikator", sub: result.sub };
  }
  if (result.code === KONTO_BINDING_AWARIA) return { rodzaj: "awaria" };
  return { rodzaj: "brak-powiazania" };
}

export default function NiepowiazanePage() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [sprawdzanie, setSprawdzanie] = useState(false);
  const [stan, setStan] = useState<StanEkranu>({ rodzaj: "sprawdzanie" });

  const zastosujWynik = useCallback((result: AccountBindingCheck | null) => {
    setStan(stanZWyniku(result));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void sprawdzZLimitem().then((result) => {
      if (!cancelled) zastosujWynik(result);
    });
    return () => {
      cancelled = true;
    };
  }, [zastosujWynik]);

  async function ponowSprawdzenie() {
    setSprawdzanie(true);
    const result = await sprawdzZLimitem();
    zastosujWynik(result);
    setSprawdzanie(false);
  }

  async function copyIdentifier() {
    if (stan.rodzaj !== "identyfikator") return;
    await navigator.clipboard.writeText(stan.sub);
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

  // Nagłówek też jest twierdzeniem: dopóki wynik nie wrócił, mówi tylko,
  // czego ekran dotyczy, a nie jak się to skończyło.
  const naglowek =
    stan.rodzaj === "identyfikator" || stan.rodzaj === "brak-powiazania"
      ? "Konto nie jest jeszcze połączone"
      : "Twoje konto w PsychON";

  return (
    <main id="tresc" className="flex min-h-screen items-center justify-center bg-page p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-h2 font-black text-ink">{naglowek}</h1>
        </div>

        <Card>
          <div className="flex flex-col gap-4">
            <div aria-live="polite" className="flex flex-col gap-4">
              {stan.rodzaj === "sprawdzanie" ? (
                <Alert variant="info">
                  <p>Sprawdzam stan Twojego konta…</p>
                </Alert>
              ) : stan.rodzaj === "identyfikator" ? (
                <Alert variant="error">
                  <p>
                    Twoje konto Niepodzielni nie jest jeszcze powiązane z PsychON. Przekaż
                    administratorowi ten identyfikator:
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="break-all rounded-sm bg-card px-2 py-1 text-small">
                      {stan.sub}
                    </code>
                    <Button type="button" variant="secondary" onClick={() => void copyIdentifier()}>
                      Kopiuj
                    </Button>
                  </div>
                </Alert>
              ) : stan.rodzaj === "awaria" ? (
                <Alert variant="info">
                  <p>Nie udało się sprawdzić stanu Twojego konta — spróbuj ponownie za chwilę.</p>
                  <div className="mt-2">
                    <Button
                      type="button"
                      className="min-h-11"
                      loading={sprawdzanie}
                      onClick={() => void ponowSprawdzenie()}
                    >
                      Spróbuj ponownie
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
            </div>
            <Button
              type="button"
              variant={stan.rodzaj === "awaria" ? "secondary" : "primary"}
              className="w-full"
              loading={signingOut}
              onClick={() => void logout()}
            >
              Wyloguj
            </Button>
          </div>
        </Card>
      </div>
    </main>
  );
}
