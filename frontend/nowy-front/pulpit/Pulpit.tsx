"use client";

import { useCallback, useEffect, useState } from "react";
import { pobierzKonto, type KontoPulpitu } from "./dane";
import { EkranStanu, type StanBezDanych } from "./EkranStanu";
import { PulpitStudenta } from "./PulpitStudenta";
import { PulpitUczestnika } from "./PulpitUczestnika";
import { rodzajBledu } from "./rodzaj-bledu";

type StanWyboru = StanBezDanych | "ok";

/**
 * Trasa `/nowy-front/pulpit` — jeden adres, dwa pulpity: wolontariusz widzi
 * `PulpitUczestnika` (U-01), student `PulpitStudenta` (U-02). Rolę daje
 * istniejące źródło, `GET /me` → `role` (`backend/routes/api/h01.php:27`);
 * ekran nie ma własnej reguły dostępu. Inna rola (prowadzący, administracja)
 * dostaje stan „brak dostępu”, a nie cudzy pulpit.
 *
 * Odczyt biegnie z przeglądarki — ten sam powód co w `dane.ts`.
 */
export function Pulpit() {
  const [stan, setStan] = useState<StanWyboru>("ladowanie");
  const [konto, setKonto] = useState<KontoPulpitu | null>(null);

  const wczytaj = useCallback((straz?: { anulowane: boolean }) => {
    pobierzKonto()
      .then((dane) => {
        if (straz?.anulowane) return;
        setKonto(dane);
        setStan("ok");
      })
      .catch((wyjatek: unknown) => {
        if (straz?.anulowane) return;
        setStan(rodzajBledu(wyjatek));
      });
  }, []);

  const ponow = useCallback(() => {
    setStan("ladowanie");
    wczytaj();
  }, [wczytaj]);

  useEffect(() => {
    const straz = { anulowane: false };
    wczytaj(straz);
    return () => {
      straz.anulowane = true;
    };
  }, [wczytaj]);

  if (stan !== "ok" || konto === null) {
    return <EkranStanu stan={stan === "ok" ? "ladowanie" : stan} onPonow={ponow} />;
  }

  if (konto.role === "volunteer") {
    return <PulpitUczestnika programUkonczony={konto.program_completed_at !== null} />;
  }

  if (konto.role === "student") {
    return <PulpitStudenta />;
  }

  return <EkranStanu stan="zakazane" onPonow={ponow} />;
}
