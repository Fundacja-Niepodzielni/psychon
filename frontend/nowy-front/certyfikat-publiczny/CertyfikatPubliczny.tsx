"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Link } from "@/design-system/atomy/Link/Link";
import { Text } from "@/design-system/atomy/Text/Text";
import { api, ApiError } from "@/lib/api";
import { Komunikat } from "../wspolne/strona-publiczna/Komunikat";
import { RamaPubliczna } from "../wspolne/strona-publiczna/RamaPubliczna";
import { Wczytywanie } from "../wspolne/strona-publiczna/Wczytywanie";
import { KartaWyniku } from "./KartaWyniku";
import { celZAdresu, KOMUNIKAT_AWARII, KOMUNIKAT_NIE_ZNALEZIONO, type WynikWeryfikacji } from "./logika";
import style from "./CertyfikatPubliczny.module.css";

function TrescCertyfikatu() {
  const params = useSearchParams();
  const cel = celZAdresu(params.get("token"), params.get("number"));
  const sciezka = cel.rodzaj === "sciezka" ? cel.sciezka : null;

  const [wynik, setWynik] = useState<WynikWeryfikacji | null>(null);
  const [nieZnaleziono, setNieZnaleziono] = useState(false);
  const [awaria, setAwaria] = useState(false);
  const [ladowanie, setLadowanie] = useState(true);
  const [ponowienie, setPonowienie] = useState(0);

  useEffect(() => {
    if (!sciezka) return;
    let aktywne = true;
    api<WynikWeryfikacji>(sciezka)
      .then((dane) => {
        if (!aktywne) return;
        setWynik(dane);
        setNieZnaleziono(false);
        setAwaria(false);
      })
      .catch((wyjatek: unknown) => {
        if (!aktywne) return;
        if (wyjatek instanceof ApiError && wyjatek.status === 404) {
          setNieZnaleziono(true);
          setWynik(null);
        } else {
          setAwaria(true);
        }
      })
      .finally(() => {
        if (aktywne) setLadowanie(false);
      });
    return () => {
      aktywne = false;
    };
  }, [sciezka, ponowienie]);

  if (cel.rodzaj === "brak") {
    return (
      <Komunikat wariant="info">
        <p>
          Brak numeru certyfikatu w adresie. Przejdź do <Link href="/weryfikacja">wyszukiwarki weryfikacji</Link>.
        </p>
      </Komunikat>
    );
  }

  if (cel.rodzaj === "bledny") {
    return (
      <Komunikat wariant="error">
        <p>{KOMUNIKAT_NIE_ZNALEZIONO}</p>
      </Komunikat>
    );
  }

  return (
    <div className={style.wyniki} aria-live="polite">
      {ladowanie && wynik === null && <Wczytywanie etykieta="Sprawdzanie…" />}
      {wynik && <KartaWyniku wynik={wynik} />}
      {nieZnaleziono && (
        <Komunikat wariant="error">
          <p>{KOMUNIKAT_NIE_ZNALEZIONO}</p>
        </Komunikat>
      )}
      {awaria && (
        <Komunikat
          wariant="error"
          tytul="Nie udało się wczytać danych"
          akcja={
            <Button
              poziom="outline"
              type="button"
              onClick={() => {
                setLadowanie(true);
                setPonowienie((n) => n + 1);
              }}
            >
              Spróbuj ponownie
            </Button>
          }
        >
          <p>{KOMUNIKAT_AWARII}</p>
        </Komunikat>
      )}
    </div>
  );
}

/**
 * Strona certyfikatu z kodu QR albo z numeru w adresie, w nowym wyglądzie —
 * ten sam przebieg co `app/certyfikat/page.tsx` (`celZAdresu`, te same ścieżki
 * `/verify/…`, te same stany).
 */
export function CertyfikatPubliczny({ logo }: { logo?: ReactNode }) {
  return (
    <RamaPubliczna logo={logo}>
      <Heading stopien={1}>Certyfikat programu</Heading>
      <Text>Fundacja Niepodzielni — program PsychON</Text>
      <Suspense fallback={<Wczytywanie etykieta="Wczytywanie…" />}>
        <TrescCertyfikatu />
      </Suspense>
    </RamaPubliczna>
  );
}
