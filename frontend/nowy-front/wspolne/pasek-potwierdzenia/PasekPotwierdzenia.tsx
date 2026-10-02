"use client";

import { useCallback, useState } from "react";
import style from "./PasekPotwierdzenia.module.css";

export type WariantPaska = "powodzenie" | "niepowodzenie";

/** Komunikat paska: `numer` rośnie przy każdym pokazaniu, więc ten sam tekst po kolejnej akcji jest ogłaszany ponownie. */
export interface KomunikatPaska {
  wariant: WariantPaska;
  tresc: string;
  numer: number;
}

export const ETYKIETA_ZAMKNIECIA_PASKA = "Zamknij komunikat";

/**
 * Przenosi fokus na nagłówek ekranu (pierwszy `h1`), gdy po zamknięciu paska
 * nic innego nie wskazano. Nagłówek nie jest domyślnie fokusowalny — dostaje
 * `tabindex="-1"`, tak jak inne cele fokusu programowego w nowej ramce.
 */
function fokusNaNaglowek(): void {
  const naglowek = document.querySelector<HTMLElement>("h1");
  if (!naglowek) return;
  if (!naglowek.hasAttribute("tabindex")) naglowek.setAttribute("tabindex", "-1");
  naglowek.focus();
}

interface WlasciwosciPaska {
  komunikat: KomunikatPaska | null;
  onZamknij: () => void;
  /** Dokąd wraca fokus po zamknięciu; domyślnie nagłówek ekranu. */
  poZamknieciu?: () => void;
}

/**
 * Pasek potwierdzenia nad treścią ekranu: jedno zdanie o tym, co się stało po
 * zapisie, wysłaniu albo decyzji. Powodzenie to `role="status"`, niepowodzenie
 * `role="alert"`. Nie znika po czasie — zamyka go przycisk „Zamknij komunikat”
 * (cel dotyku 44 px); zastępuje go kolejna akcja tego samego formularza.
 */
export function PasekPotwierdzenia({ komunikat, onZamknij, poZamknieciu }: WlasciwosciPaska) {
  if (!komunikat) return null;
  const blad = komunikat.wariant === "niepowodzenie";
  return (
    <div
      key={komunikat.numer}
      className={`${style.pasek} ${blad ? style.niepowodzenie : style.powodzenie}`}
      role={blad ? "alert" : "status"}
      data-pasek-potwierdzenia={komunikat.wariant}
    >
      <p className={style.tresc}>{komunikat.tresc}</p>
      <button
        type="button"
        className={style.zamknij}
        aria-label={ETYKIETA_ZAMKNIECIA_PASKA}
        onClick={() => {
          onZamknij();
          (poZamknieciu ?? fokusNaNaglowek)();
        }}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

export interface StanPaska {
  komunikat: KomunikatPaska | null;
  /** Pokazuje powodzenie; zastępuje poprzedni komunikat. */
  powodzenie: (tresc: string) => void;
  /** Pokazuje niepowodzenie; zastępuje poprzedni komunikat. */
  niepowodzenie: (tresc: string) => void;
  /** Zdejmuje komunikat — wołać na początku następnej akcji tego samego formularza. */
  ukryj: () => void;
}

/** Stan paska jednego ekranu: `komunikat` oddaje się do `PasekPotwierdzenia`. */
export function usePasekPotwierdzenia(): StanPaska {
  const [komunikat, ustaw] = useState<KomunikatPaska | null>(null);
  const pokaz = useCallback(
    (wariant: WariantPaska, tresc: string) => ustaw((poprzedni) => ({ wariant, tresc, numer: (poprzedni?.numer ?? 0) + 1 })),
    [],
  );
  const powodzenie = useCallback((tresc: string) => pokaz("powodzenie", tresc), [pokaz]);
  const niepowodzenie = useCallback((tresc: string) => pokaz("niepowodzenie", tresc), [pokaz]);
  const ukryj = useCallback(() => ustaw(null), []);
  return { komunikat, powodzenie, niepowodzenie, ukryj };
}
