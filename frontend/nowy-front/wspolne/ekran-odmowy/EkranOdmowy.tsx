"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import style from "./EkranOdmowy.module.css";
import { useBiezacaOsoba } from "./useBiezacaOsoba";

export type RodzajOdmowy = "brak-dostepu" | "nie-znaleziono" | "dostep-wygasl";

/**
 * Zdania „co się stało” — jedyne miejsce, w którym powstają. „Nie znaleziono” jest jednym zdaniem dla zasobu
 * nieistniejącego i cudzego: ekran nie ujawnia, czy zasób istnieje.
 */
export const ZDANIA_ODMOWY: Record<RodzajOdmowy, string> = {
  "brak-dostepu": "Nie masz dostępu do tej strony.",
  "nie-znaleziono": "Nie znaleźliśmy tej strony.",
  "dostep-wygasl": "Twój dostęp wygasł.",
};

interface WlasciwosciEkranOdmowy {
  rodzaj: RodzajOdmowy;
  /** Jedno zdanie „co dalej”, bez kodów technicznych i numerów statusu. */
  coDalej: string;
  /** DOKŁADNIE jeden przycisk: wyjście z ekranu. */
  przycisk: { etykieta: string; onClick: () => void };
  /** Poziom nagłówka właściwy dla ekranu (domyślnie 1). */
  stopien?: 1 | 2;
}

/** Zdanie „kim jestem zalogowany” z danych konta albo `null`, gdy nie ma z czego go zbudować. */
function zdanieOsoby(imie: string | null, rola: string | null): string | null {
  if (imie !== null && rola !== null) return `Zalogowano jako ${imie}, rola: ${rola}.`;
  if (imie !== null) return `Zalogowano jako ${imie}.`;
  if (rola !== null) return `Zalogowano z rolą: ${rola}.`;
  return null;
}

/**
 * Wspólny wzór odmowy, „nie znaleziono” i wygasłego dostępu na ekranach nowej ramki. Trzy stałe części:
 * co się stało (nagłówek, na którym ląduje fokus po wejściu), kim jestem zalogowany (imię i rola z konta, bez
 * adresu e-mail) i co dalej (jedno zdanie i dokładnie jeden przycisk). Zachowanie — kto i kiedy dostaje odmowę —
 * rozstrzyga ekran, który wzór wstawia; wzór zmienia wyłącznie wygląd i treść.
 */
export function EkranOdmowy({ rodzaj, coDalej, przycisk, stopien = 1 }: WlasciwosciEkranOdmowy) {
  const idNaglowka = useId();
  const naglowek = useRef<HTMLHeadingElement>(null);
  const osoba = useBiezacaOsoba();
  const zdanie = osoba === null ? null : zdanieOsoby(osoba.imie, osoba.rola);
  const Znacznik = `h${stopien}` as const;

  useEffect(() => {
    naglowek.current?.focus();
  }, []);

  return (
    <section className={style.pojemnik} aria-labelledby={idNaglowka}>
      <Znacznik ref={naglowek} id={idNaglowka} className={style.naglowek} tabIndex={-1}>
        {ZDANIA_ODMOWY[rodzaj]}
      </Znacznik>
      {zdanie !== null && <p className={style.osoba}>{zdanie}</p>}
      <p className={style.dalej}>{coDalej}</p>
      <Button poziom="primary" onClick={przycisk.onClick}>
        {przycisk.etykieta}
      </Button>
    </section>
  );
}
