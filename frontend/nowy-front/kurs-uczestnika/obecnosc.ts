"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { potwierdzObecnosc, sklasyfikujBladObecnosci, type BladObecnosci } from "./dane";
import type { NadpisanieOkna } from "./webinar";

/**
 * Potwierdzanie obecności na webinarze: jedno `POST /courses/{slug}/attendance`
 * (puste ciało) naraz, wynik jako stan ekranu. Odmowa 422 niesie okno według
 * serwera (`reason.window`), które wygrywa z odczytem i zegarem do ponownego
 * wczytania strony. Hak służy ekranowi webinaru i karcie na pulpicie — jedna
 * implementacja, jedno zdanie o każdym wyniku.
 */

export type StanObecnosci =
  | { rodzaj: "spoczynek" }
  | { rodzaj: "trwa" }
  | { rodzaj: "potwierdzona"; attendedAt: string }
  | { rodzaj: "blad"; blad: BladObecnosci };

export interface WynikHakuObecnosci {
  stan: StanObecnosci;
  /** Okno z odmowy 422; `null`, dopóki serwer nie odmówił z oknem. */
  nadpisanieOkna: NadpisanieOkna | null;
  potwierdz: () => void;
}

export function useObecnosc(slug: string): WynikHakuObecnosci {
  const [stan, setStan] = useState<StanObecnosci>({ rodzaj: "spoczynek" });
  const [nadpisanieOkna, setNadpisanieOkna] = useState<NadpisanieOkna | null>(null);
  const wToku = useRef(false);

  const potwierdz = useCallback(() => {
    if (wToku.current) return;
    wToku.current = true;
    setStan({ rodzaj: "trwa" });
    potwierdzObecnosc(slug)
      .then(
        (odpowiedz) => setStan({ rodzaj: "potwierdzona", attendedAt: odpowiedz.attended_at }),
        (wyjatek: unknown) => {
          const blad = sklasyfikujBladObecnosci(wyjatek);
          if (blad.rodzaj === "okno" && blad.okno !== null) {
            setNadpisanieOkna({ okno: blad.okno, otwiera: blad.otwiera, zamyka: blad.zamyka });
          }
          setStan({ rodzaj: "blad", blad });
        },
      )
      .finally(() => {
        wToku.current = false;
      });
  }, [slug]);

  return { stan, nadpisanieOkna, potwierdz };
}

/** Bieżąca chwila odświeżana co `odswiezanieMs`, żeby okno obecności przesuwało się bez ponownego wczytania strony. */
export function useTeraz(odswiezanieMs = 30_000): number {
  const [teraz, setTeraz] = useState(() => Date.now());
  useEffect(() => {
    const zegar = setInterval(() => setTeraz(Date.now()), odswiezanieMs);
    return () => clearInterval(zegar);
  }, [odswiezanieMs]);
  return teraz;
}
