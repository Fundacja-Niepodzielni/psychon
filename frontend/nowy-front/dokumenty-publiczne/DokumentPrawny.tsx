"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Link } from "@/design-system/atomy/Link/Link";
import { Text } from "@/design-system/atomy/Text/Text";
import { ApiError } from "@/lib/api";
import {
  fetchLegalDocument,
  jestZnanymTypemDokumentu,
  LEGAL_DOCUMENT_LABELS,
  type LegalDocument,
} from "@/lib/h22/legal-documents";
import { formatujDate } from "../wspolne/daty";
import { Karta } from "../wspolne/strona-publiczna/Karta";
import { Komunikat } from "../wspolne/strona-publiczna/Komunikat";
import { RamaPubliczna } from "../wspolne/strona-publiczna/RamaPubliczna";
import { Wczytywanie } from "../wspolne/strona-publiczna/Wczytywanie";
import { akapityTresci } from "./logika";
import style from "./DokumentyPubliczne.module.css";

type Ekran =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "gotowy"; dokument: LegalDocument }
  | { rodzaj: "nieopublikowany" }
  | { rodzaj: "nieznany-typ" }
  | { rodzaj: "blad" };

const KOMUNIKAT_AWARII = "Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.";

/**
 * Dokument prawny w nowym wyglądzie — ten sam przebieg co
 * `app/dokumenty-prawne/[typ]/page.tsx`: rodzaj spoza listy → „nie znaleziono”
 * bez żądania; `fetchLegalDocument(typ)`; 404 → „nie opublikowano”; inny błąd
 * → awaria z ponowieniem. Wynik jest związany z parametrami żądania, więc po
 * zmianie rodzaju albo ponowieniu stary ekran nie zostaje na widoku.
 */
export function DokumentPrawny({ typ, logo }: { typ: string; logo?: ReactNode }) {
  const znany = jestZnanymTypemDokumentu(typ);
  const [ponowienie, setPonowienie] = useState(0);
  const klucz = `${typ}#${ponowienie}`;
  const [wczytany, setWczytany] = useState<{ klucz: string; ekran: Ekran } | null>(null);

  useEffect(() => {
    if (!znany) return;
    let aktywne = true;
    fetchLegalDocument(typ)
      .then((dokument) => {
        if (aktywne) setWczytany({ klucz, ekran: { rodzaj: "gotowy", dokument } });
      })
      .catch((wyjatek: unknown) => {
        if (!aktywne) return;
        const nieopublikowany = wyjatek instanceof ApiError && wyjatek.status === 404;
        setWczytany({ klucz, ekran: { rodzaj: nieopublikowany ? "nieopublikowany" : "blad" } });
      });
    return () => {
      aktywne = false;
    };
  }, [typ, znany, klucz]);

  const stan: Ekran = !znany
    ? { rodzaj: "nieznany-typ" }
    : wczytany !== null && wczytany.klucz === klucz
      ? wczytany.ekran
      : { rodzaj: "ladowanie" };

  if (stan.rodzaj === "nieznany-typ") {
    return (
      <RamaPubliczna logo={logo} szerokosc="czytelna">
        <Karta>
          <Heading stopien={1}>Nie znaleziono dokumentu</Heading>
          <Text>Ten rodzaj dokumentu prawnego nie istnieje.</Text>
          <Text>
            <Link href="/">Wróć na stronę główną</Link>
          </Text>
        </Karta>
      </RamaPubliczna>
    );
  }

  return (
    <RamaPubliczna logo={logo} szerokosc="czytelna">
      <Heading stopien={1}>{LEGAL_DOCUMENT_LABELS[typ as keyof typeof LEGAL_DOCUMENT_LABELS]}</Heading>

      {stan.rodzaj === "ladowanie" && <Wczytywanie etykieta="Wczytywanie dokumentu…" wiersze={6} />}

      {stan.rodzaj === "gotowy" && (
        <Karta>
          <p className={style.drobny}>
            Wersja {stan.dokument.version} · {formatujDate(stan.dokument.published_at)}
          </p>
          <div className={style.tresc}>
            {akapityTresci(stan.dokument.content).map((akapit, indeks) => (
              <Text key={indeks}>{akapit}</Text>
            ))}
          </div>
        </Karta>
      )}

      {stan.rodzaj === "nieopublikowany" && (
        <Komunikat wariant="info">
          <p>Dokument nie został jeszcze opublikowany.</p>
        </Komunikat>
      )}

      {stan.rodzaj === "blad" && (
        <Komunikat
          wariant="error"
          tytul="Nie udało się wczytać danych"
          akcja={
            <Button poziom="outline" type="button" onClick={() => setPonowienie((n) => n + 1)}>
              Spróbuj ponownie
            </Button>
          }
        >
          <p>{KOMUNIKAT_AWARII}</p>
        </Komunikat>
      )}
    </RamaPubliczna>
  );
}
