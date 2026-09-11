"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

/**
 * Hak pobrania pojedynczego zasobu (C2 wariant C, część 3 „Haki danych").
 * Zastępuje ręczny wzorzec `useEffect` + `loading` + `error`, powtórzony w
 * 37 plikach (KC-4). `pobierz` woła istniejące eksporty `lib/api.ts` (albo
 * dowolną inną funkcję zwracającą `Promise<T>`) — hak nie zna kontraktu API,
 * tylko cykl życia żądania: ładowanie → sukces albo błąd, z ponowieniem.
 *
 * `zaleznosci` działa jak druga tablica zależności `useEffect` (np. filtr,
 * identyfikator rekordu) — zmiana elementu odpytuje serwer ponownie.
 */
export function useZasob<T>(
  pobierz: () => Promise<T>,
  zaleznosci: readonly unknown[] = [],
  komunikatBledu: string = DOMYSLNY_KOMUNIKAT_BLEDU,
): UseZasobResult<T> {
  const [stan, setStan] = useState<StanZasobu<T>>({ status: "loading" });
  const [proba, setProba] = useState(0);
  // Ref, żeby zmiana referencji funkcji (nowy literał przy każdym renderze
  // wywołującego) nie odpytywała serwera w kółko — tylko `zaleznosci` i
  // ponowienie mają na to wpływ.
  const pobierzRef = useRef(pobierz);
  pobierzRef.current = pobierz;

  useEffect(() => {
    let aktywny = true;
    setStan({ status: "loading" });

    pobierzRef
      .current()
      .then((data) => {
        if (aktywny) setStan({ status: "success", data });
      })
      .catch((err: unknown) => {
        if (!aktywny) return;
        setStan({
          status: "error",
          message: err instanceof ApiError ? err.message : komunikatBledu,
        });
      });

    return () => {
      aktywny = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proba, komunikatBledu, ...zaleznosci]);

  const ponow = useCallback(() => setProba((n) => n + 1), []);

  return { stan, ponow };
}
