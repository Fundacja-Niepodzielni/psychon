"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import style from "./EkranOdmowy.module.css";
import { useBiezacaOsoba } from "./useBiezacaOsoba";

export type RodzajOdmowy = "brak-dostepu" | "nie-znaleziono" | "dostep-wygasl";

/** Adres pulpitu uczestnika: cel przycisku odmowy, dopóki ekran nie poda innego. */
export const ADRES_PULPITU = "/panel/pulpit";

/** Napis przycisku odmowy, dopóki ekran nie poda innego. */
export const PRZYCISK_ODMOWY = "Wróć do pulpitu";

/**
 * Nagłówki „co się stało” — jedyne miejsce, w którym powstają. „Nie znaleziono {czego}” niesie nazwę rzeczy
 * podaną przez ekran i jest tym samym zdaniem dla zasobu nieistniejącego i cudzego: ekran nie ujawnia, czy
 * zasób istnieje.
 */
export const ZDANIA_ODMOWY: Record<RodzajOdmowy, string> = {
  "brak-dostepu": "Nie masz dostępu do tego ekranu",
  "nie-znaleziono": "Nie znaleziono {czego}",
  "dostep-wygasl": "Twój dostęp wygasł.",
};

/** Nagłówek odmowy danego rodzaju; `czego` (np. „lekcji”, „kursu”) dotyczy tylko „nie znaleziono”. */
export function naglowekOdmowy(rodzaj: RodzajOdmowy, czego = "strony"): string {
  return ZDANIA_ODMOWY[rodzaj].replace("{czego}", czego);
}

interface WlasciwosciEkranOdmowy {
  rodzaj: RodzajOdmowy;
  /** Nazwa rzeczy w dopełniaczu dla „nie znaleziono” („lekcji”, „kursu”); domyślnie „strony”. */
  czego?: string;
  /** Rola, dla której jest ten ekran, gdy ekran ją zna; dopisuje zdanie „Ten ekran jest dla …”. */
  rolaDocelowa?: string;
  /** Opcjonalne zdanie „co dalej”, bez kodów technicznych i numerów statusu. */
  coDalej?: string;
  /** DOKŁADNIE jeden przycisk: wyjście z ekranu; napis domyślny „Wróć do pulpitu”, cel podaje ekran. */
  przycisk: { etykieta?: string; onClick: () => void };
  /** Poziom nagłówka właściwy dla ekranu (domyślnie 1). */
  stopien?: 1 | 2;
}

/** Zdanie „kim jestem zalogowany” (rola z konta, bez imienia i e-maila) albo `null`, gdy nie ma z czego go zbudować. */
function zdanieOsoby(rola: string | null, rolaDocelowa: string | undefined): string | null {
  const jestem = rola === null ? null : `Jesteś zalogowany jako ${rola}.`;
  const dla = rolaDocelowa === undefined ? null : `Ten ekran jest dla ${rolaDocelowa}.`;
  if (jestem !== null && dla !== null) return `${jestem} ${dla}`;
  return jestem ?? dla;
}

/**
 * Wspólny wzór odmowy, „nie znaleziono” i wygasłego dostępu na ekranach nowej ramki. Trzy stałe części:
 * co się stało (nagłówek, na którym ląduje fokus po wejściu), kim jestem zalogowany (rola z konta, bez imienia
 * i adresu e-mail) i co dalej (opcjonalne zdanie i dokładnie jeden przycisk). Zachowanie — kto i kiedy dostaje odmowę —
 * rozstrzyga ekran, który wzór wstawia; wzór zmienia wyłącznie wygląd i treść.
 */
export function EkranOdmowy({ rodzaj, czego, rolaDocelowa, coDalej, przycisk, stopien = 1 }: WlasciwosciEkranOdmowy) {
  const idNaglowka = useId();
  const naglowek = useRef<HTMLHeadingElement>(null);
  const osoba = useBiezacaOsoba();
  const zdanie = zdanieOsoby(osoba === null ? null : osoba.rola, rolaDocelowa);
  const Znacznik = `h${stopien}` as const;

  useEffect(() => {
    naglowek.current?.focus();
  }, []);

  return (
    <section className={style.pojemnik} aria-labelledby={idNaglowka}>
      <Znacznik ref={naglowek} id={idNaglowka} className={style.naglowek} tabIndex={-1}>
        {naglowekOdmowy(rodzaj, czego)}
      </Znacznik>
      {zdanie !== null && <p className={style.osoba}>{zdanie}</p>}
      {coDalej !== undefined && <p className={style.dalej}>{coDalej}</p>}
      <Button poziom="primary" onClick={przycisk.onClick}>
        {przycisk.etykieta ?? PRZYCISK_ODMOWY}
      </Button>
    </section>
  );
}
