"use client";

import { getSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { api } from "@/lib/api";
import { homeForRole } from "@/lib/home-by-role";
import { czyZalogowana } from "../logowanie/logika";
import { Karta } from "../wspolne/strona-publiczna/Karta";
import { Komunikat } from "../wspolne/strona-publiczna/Komunikat";
import { RamaPubliczna } from "../wspolne/strona-publiczna/RamaPubliczna";
import { Wczytywanie } from "../wspolne/strona-publiczna/Wczytywanie";
import style from "../wspolne/strona-publiczna/publiczne.module.css";
import {
  adresPowrotuAktywacji,
  KOMUNIKAT_BRAKU_TOKENU,
  stanPoBledzieWiazania,
  zdanieOczekiwania,
  type StanAktywacji,
} from "./logika";

interface PowiazaneKonto {
  role: string;
}

/**
 * `/aktywacja?token=…` w nowym wyglądzie — ten sam przebieg co
 * `app/aktywacja/page.tsx`: bez sesji przycisk logowania z powrotem na ten sam
 * adres; z sesją od razu `POST /sso/powiaz` z tokenem i lądowanie wg roli.
 */
function TrescAktywacji() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [stan, setStan] = useState<StanAktywacji>({ krok: "sprawdzanie" });
  const [ponowienie, setPonowienie] = useState(0);

  useEffect(() => {
    let anulowane = false;

    async function uruchom() {
      const sesja = await getSession();
      if (anulowane) return;

      if (!czyZalogowana(sesja)) {
        setStan({ krok: "brak-sesji" });
        return;
      }

      if (!token) {
        setStan({ krok: "blad", komunikat: KOMUNIKAT_BRAKU_TOKENU, mozliwePonowienie: false });
        return;
      }

      setStan({ krok: "wiazanie" });
      try {
        const konto = await api<PowiazaneKonto>("/sso/powiaz", { method: "POST", body: { token } });
        if (anulowane) return;
        setStan({ krok: "sukces" });
        router.replace(homeForRole(konto.role));
      } catch (wyjatek) {
        if (anulowane) return;
        const nastepny = stanPoBledzieWiazania(wyjatek);
        if (nastepny) setStan(nastepny);
      }
    }

    void uruchom();
    return () => {
      anulowane = true;
    };
    // Tak jak na starej stronie: efekt zależy wyłącznie od tokenu i licznika ponowień.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, ponowienie]);

  switch (stan.krok) {
    case "brak-sesji":
      return (
        <>
          <Text>Zaloguj się przez konto Niepodzielni, aby powiązać je z tym zaproszeniem.</Text>
          <div className={style.przyciski}>
            <Button
              poziom="primary"
              type="button"
              onClick={() => void signIn("keycloak", { callbackUrl: adresPowrotuAktywacji(token) })}
            >
              Zaloguj przez konto Niepodzielni
            </Button>
          </div>
        </>
      );
    case "odmowa":
      return (
        <Komunikat wariant="warn" tytul="Brak dostępu">
          <p>{stan.komunikat}</p>
        </Komunikat>
      );
    case "blad":
      return stan.mozliwePonowienie ? (
        <Komunikat
          wariant="error"
          tytul="Nie udało się wczytać danych"
          akcja={
            <Button poziom="outline" type="button" onClick={() => setPonowienie((n) => n + 1)}>
              Spróbuj ponownie
            </Button>
          }
        >
          <p>{stan.komunikat}</p>
        </Komunikat>
      ) : (
        <Komunikat wariant="error">
          <p>{stan.komunikat}</p>
        </Komunikat>
      );
    default:
      return (
        <Komunikat wariant="info">
          <p>{zdanieOczekiwania(stan.krok)}</p>
        </Komunikat>
      );
  }
}

export function Aktywacja({ logo }: { logo?: ReactNode }) {
  return (
    <RamaPubliczna logo={logo}>
      <Karta>
        <Heading stopien={1}>Aktywacja konta</Heading>
        <Suspense fallback={<Wczytywanie etykieta="Wczytywanie…" />}>
          <TrescAktywacji />
        </Suspense>
      </Karta>
    </RamaPubliczna>
  );
}
