"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import VerificationCard, {
  type VerifyResult,
} from "@/components/certyfikat/VerificationCard";
import Alert from "@/components/ui/Alert";
import ErrorState from "@/components/molecules/ErrorState";
import LoadingState from "@/components/molecules/LoadingState";
import PublicPageTemplate from "@/components/templates/PublicPageTemplate";
import { api, ApiError } from "@/lib/api";
import {
  czyNumerCertyfikatu,
  czyTokenCertyfikatu,
  sciezkaWeryfikacjiNumeru,
  sciezkaWeryfikacjiTokenu,
} from "@/lib/certyfikat/ksztalt";

const KOMUNIKAT_NIE_ZNALEZIONO = "Nie znaleziono certyfikatu o podanym numerze.";

type CelZAdresu =
  | { rodzaj: "brak" }
  | { rodzaj: "bledny" }
  | { rodzaj: "sciezka"; sciezka: string };

/**
 * Wartość z adresu strony wchodzi do ścieżki żądania wyłącznie po sprawdzeniu
 * kształtu (białe znaki z brzegów obcięte przed sprawdzeniem). Wartość spoza
 * kształtu nie jest numerem ani tokenem żadnego certyfikatu — ekran nie pyta o
 * nią serwera i pokazuje to samo co dla numeru nieznanego. Pierwszeństwo
 * `token` przed `number` bez zmian.
 */
function celZAdresu(token: string | null, number: string | null): CelZAdresu {
  if (token) {
    const wartosc = token.trim();
    return czyTokenCertyfikatu(wartosc)
      ? { rodzaj: "sciezka", sciezka: sciezkaWeryfikacjiTokenu(wartosc) }
      : { rodzaj: "bledny" };
  }
  if (number) {
    const wartosc = number.trim();
    return czyNumerCertyfikatu(wartosc)
      ? { rodzaj: "sciezka", sciezka: sciezkaWeryfikacjiNumeru(wartosc) }
      : { rodzaj: "bledny" };
  }
  return { rodzaj: "brak" };
}

function CertificateLanding() {
  const params = useSearchParams();
  const cel = celZAdresu(params.get("token"), params.get("number"));
  const path = cel.rodzaj === "sciezka" ? cel.sciezka : null;

  const [result, setResult] = useState<VerifyResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [awaria, setAwaria] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ponowienie, setPonowienie] = useState(0);

  useEffect(() => {
    // Gałąź bez ścieżki renderuje wyłącznie komunikat obok (niezależnie od
    // `loading`, patrz JSX niżej) — nie ma tu niczego do wczytania, więc
    // stan ładowania nigdy się w tej gałęzi nie ujawnia na ekranie.
    if (!path) return;

    let active = true;
    api<VerifyResult>(path)
      .then((wynik) => {
        if (!active) return;
        setResult(wynik);
        setNotFound(false);
        setAwaria(false);
      })
      .catch((err) => {
        if (!active) return;
        // 404 (numer/token nieznany) — to rozstrzygnięcie samo w sobie, stary
        // wynik przestaje być aktualną odpowiedzią. Każda inna odpowiedź
        // (5xx, sieć) to awaria połączenia — poprzednio wczytany wynik
        // zostaje na ekranie, komunikat awarii idzie obok niego.
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
          setResult(null);
        } else {
          setAwaria(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, ponowienie]);

  return (
    <PublicPageTemplate
      naglowek={{
        title: "Certyfikat programu",
        description: "Fundacja Niepodzielni — program PsychON",
      }}
    >
      {cel.rodzaj === "brak" ? (
        <Alert variant="info">
          Brak numeru certyfikatu w adresie. Przejdź do{" "}
          <Link
            href="/weryfikacja"
            className="font-medium underline underline-offset-4"
          >
            wyszukiwarki weryfikacji
          </Link>
          .
        </Alert>
      ) : cel.rodzaj === "bledny" ? (
        <Alert variant="error">{KOMUNIKAT_NIE_ZNALEZIONO}</Alert>
      ) : (
        <>
          {loading && result === null && <LoadingState label="Sprawdzanie…" />}
          {result && <VerificationCard result={result} />}
          {notFound && <Alert variant="error">{KOMUNIKAT_NIE_ZNALEZIONO}</Alert>}
          {awaria && (
            <ErrorState
              message="Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę."
              // Flaga wczytywania idzie w górę tutaj, nie w ciele efektu:
              // wywołanie setState synchronicznie wewnątrz efektu wywołuje
              // kaskadę renderów (reguła react-hooks/set-state-in-effect),
              // a bramka zatrzymuje się na kroku lintu frontu.
              onRetry={() => {
                setLoading(true);
                setPonowienie((n) => n + 1);
              }}
            />
          )}
        </>
      )}
    </PublicPageTemplate>
  );
}

export default function CertificateLandingPage() {
  return (
    <Suspense fallback={<LoadingState label="Wczytywanie…" />}>
      <CertificateLanding />
    </Suspense>
  );
}
