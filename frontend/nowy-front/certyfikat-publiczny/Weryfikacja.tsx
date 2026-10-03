"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { Field } from "@/design-system/molekuly/Field/Field";
import { api, ApiError } from "@/lib/api";
import { czyNumerCertyfikatu, sciezkaWeryfikacjiNumeru } from "@/lib/certyfikat/ksztalt";
import { Karta } from "../wspolne/strona-publiczna/Karta";
import { Komunikat } from "../wspolne/strona-publiczna/Komunikat";
import { RamaPubliczna } from "../wspolne/strona-publiczna/RamaPubliczna";
import { KartaWyniku } from "./KartaWyniku";
import { KOMUNIKAT_AWARII, KOMUNIKAT_NIE_ZNALEZIONO, type WynikWeryfikacji } from "./logika";
import style from "./CertyfikatPubliczny.module.css";

/**
 * Wyszukiwarka weryfikacji certyfikatu w nowym wyglądzie — ten sam przebieg co
 * `app/weryfikacja/page.tsx`: numer obcięty z białych znaków, numer spoza
 * kształtu → „nie znaleziono” bez żądania, 404 → „nie znaleziono” i znika stary
 * wynik, inna odpowiedź → awaria obok dotychczasowego wyniku, z ponowieniem
 * tego samego numeru. „Nie znaleziono” stoi przy polu (`aria-describedby`).
 */
export function Weryfikacja({ logo }: { logo?: ReactNode }) {
  const [numer, setNumer] = useState("");
  const [wynik, setWynik] = useState<WynikWeryfikacji | null>(null);
  const [nieZnaleziono, setNieZnaleziono] = useState(false);
  const [awaria, setAwaria] = useState(false);
  const [ladowanie, setLadowanie] = useState(false);
  const [ostatnieZapytanie, setOstatnieZapytanie] = useState("");
  const wTrakcie = useRef(false);

  async function wyszukaj(zapytanie: string) {
    if (!czyNumerCertyfikatu(zapytanie)) {
      setOstatnieZapytanie(zapytanie);
      setAwaria(false);
      setNieZnaleziono(true);
      setWynik(null);
      return;
    }
    if (wTrakcie.current) return;
    wTrakcie.current = true;
    setLadowanie(true);
    setNieZnaleziono(false);
    setAwaria(false);
    setOstatnieZapytanie(zapytanie);
    try {
      setWynik(await api<WynikWeryfikacji>(sciezkaWeryfikacjiNumeru(zapytanie)));
    } catch (wyjatek) {
      if (wyjatek instanceof ApiError && wyjatek.status === 404) {
        setNieZnaleziono(true);
        setWynik(null);
      } else {
        setAwaria(true);
      }
    } finally {
      setLadowanie(false);
      wTrakcie.current = false;
    }
  }

  async function wyslij(zdarzenie: FormEvent) {
    zdarzenie.preventDefault();
    const zapytanie = numer.trim();
    if (!zapytanie) return;
    await wyszukaj(zapytanie);
  }

  return (
    <RamaPubliczna logo={logo}>
      <Heading stopien={1}>Weryfikacja certyfikatu</Heading>
      <Text>Wpisz numer certyfikatu, np. NP/2026/001</Text>
      <Karta>
        <form onSubmit={(z) => void wyslij(z)} noValidate className={style.formularz}>
          <Field
            id="weryfikacja-numer"
            etykieta="Numer certyfikatu"
            rodzaj="tekst"
            wymagane
            placeholder="NP/2026/001"
            wartosc={numer}
            onZmiana={setNumer}
            blad={nieZnaleziono ? KOMUNIKAT_NIE_ZNALEZIONO : undefined}
          />
          <Button
            poziom="primary"
            type="submit"
            aria-busy={ladowanie || undefined}
            aria-disabled={ladowanie || undefined}
          >
            Sprawdź
          </Button>
        </form>
      </Karta>

      <div className={style.wyniki} aria-live="polite">
        {wynik && <KartaWyniku wynik={wynik} />}
        {awaria && (
          <Komunikat
            wariant="error"
            tytul="Nie udało się wczytać danych"
            akcja={
              <Button poziom="outline" type="button" onClick={() => void wyszukaj(ostatnieZapytanie)}>
                Spróbuj ponownie
              </Button>
            }
          >
            <p>{KOMUNIKAT_AWARII}</p>
          </Komunikat>
        )}
      </div>
    </RamaPubliczna>
  );
}
