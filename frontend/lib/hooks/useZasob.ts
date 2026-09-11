"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";

/**
 * Stan pojedynczego pobrania — jeden z trzech, nigdy kombinacja
 * `loading` + `error` osobnymi zmiennymi (to właśnie 37 kopii z KC-4).
 */
export type StanZasobu<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: T };

export interface UseZasobResult<T> {
  stan: StanZasobu<T>;
  /** Ponawia pobranie bez przeładowania strony. */
  ponow: () => void;
}

const DOMYSLNY_KOMUNIKAT_BLEDU =
  "Nie udało się połączyć z serwerem. Spróbuj ponownie.";

interface Wynik<T> {
  dlaProby: number;
  rezultat: { status: "success"; data: T } | { status: "error"; message: string };
}

/**
 * Hak pobrania pojedynczego zasobu (C2 wariant C, część 3 „Haki danych").
 * Zastępuje ręczny wzorzec `useEffect` + `loading` + `error`, powtórzony w
 * 37 plikach (KC-4). `pobierz` woła istniejące eksporty `lib/api.ts` (albo
 * dowolną inną funkcję zwracającą `Promise<T>`) — hak nie zna kontraktu API,
 * tylko cykl życia żądania: ładowanie → sukces albo błąd, z ponowieniem.
 *
 * Stan „ładowanie" jest wyprowadzony (porównanie `dlaProby` z bieżącą
 * `proba`), nie ustawiany wprost na starcie efektu — bezpośrednie `setState`
 * w ciele efektu kaskaduje renderowania (react-hooks/set-state-in-effect).
 *
 * `zaleznosci` działa jak druga tablica zależności `useEffect` (np. filtr,
 * identyfikator rekordu) — zmiana elementu odpytuje serwer ponownie.
 */
export function useZasob<T>(
  pobierz: () => Promise<T>,
  zaleznosci: readonly unknown[] = [],
  komunikatBledu: string = DOMYSLNY_KOMUNIKAT_BLEDU,
): UseZasobResult<T> {
  const [proba, setProba] = useState(0);
  const [wynik, setWynik] = useState<Wynik<T> | null>(null);

  useEffect(() => {
    let aktywny = true;

    pobierz()
      .then((data) => {
        if (!aktywny) return;
        setWynik({ dlaProby: proba, rezultat: { status: "success", data } });
      })
      .catch((err: unknown) => {
        if (!aktywny) return;
        setWynik({
          dlaProby: proba,
          rezultat: {
            status: "error",
            message: err instanceof ApiError ? err.message : komunikatBledu,
          },
        });
      });

    return () => {
      aktywny = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proba, komunikatBledu, ...zaleznosci]);

  const stan: StanZasobu<T> =
    wynik && wynik.dlaProby === proba ? wynik.rezultat : { status: "loading" };

  const ponow = useCallback(() => setProba((n) => n + 1), []);

  return { stan, ponow };
}
