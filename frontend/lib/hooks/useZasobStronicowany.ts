"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, type PaginationMeta } from "@/lib/api";
import type { StanZasobu } from "@/lib/hooks/useZasob";

export interface UseZasobStronicowanegoResult<T> {
  stan: StanZasobu<T[]>;
  meta?: PaginationMeta;
  strona: number;
  /** Ustawia stronę wprost (np. z kliknięcia „Poprzednia" / „Następna"). */
  ustawStrone: (strona: number) => void;
  ponow: () => void;
}

const DOMYSLNY_KOMUNIKAT_BLEDU =
  "Nie udało się połączyć z serwerem. Spróbuj ponownie.";

interface Wynik<T> {
  dlaKlucza: string;
  rezultat:
    | { status: "success"; data: T[]; meta?: PaginationMeta }
    | { status: "error"; message: string };
}

/**
 * Hak stronicowanego pobrania (C2 wariant C, część 3 „Haki danych").
 * Zastępuje 9 niezależnych implementacji stronicowania — każda wywoływała
 * `apiPaged` z ręcznym `page`, `meta`, `loading`, `error` osobno. Tu jest to
 * jedno miejsce: `pobierz(strona)` woła `apiPaged`-owy eksport `lib/api.ts`.
 *
 * Stan „ładowanie" jest wyprowadzony (porównanie klucza żądania z ostatnio
 * rozstrzygniętym), tak samo jak w `useZasob`.
 */
export function useZasobStronicowany<T>(
  pobierz: (
    strona: number,
  ) => Promise<{ data: T[]; meta?: PaginationMeta }>,
  zaleznosci: readonly unknown[] = [],
  komunikatBledu: string = DOMYSLNY_KOMUNIKAT_BLEDU,
): UseZasobStronicowanegoResult<T> {
  const [strona, setStrona] = useState(1);
  const [proba, setProba] = useState(0);
  const [wynik, setWynik] = useState<Wynik<T> | null>(null);

  const klucz = `${strona}:${proba}`;

  useEffect(() => {
    let aktywny = true;

    pobierz(strona)
      .then(({ data, meta: pagination }) => {
        if (!aktywny) return;
        setWynik({
          dlaKlucza: klucz,
          rezultat: { status: "success", data, meta: pagination },
        });
      })
      .catch((err: unknown) => {
        if (!aktywny) return;
        setWynik({
          dlaKlucza: klucz,
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
  }, [strona, proba, komunikatBledu, ...zaleznosci]);

  const rozstrzygniety = wynik && wynik.dlaKlucza === klucz ? wynik.rezultat : null;
  // Budowane jawnie (nie samo `rozstrzygniety`), żeby `meta` nigdy nie
  // wyciekło do publicznego kształtu `StanZasobu` — to osobna wartość zwrotna.
  const stan: StanZasobu<T[]> = !rozstrzygniety
    ? { status: "loading" }
    : rozstrzygniety.status === "success"
      ? { status: "success", data: rozstrzygniety.data }
      : { status: "error", message: rozstrzygniety.message };
  const meta =
    rozstrzygniety && rozstrzygniety.status === "success" ? rozstrzygniety.meta : undefined;

  const ponow = useCallback(() => setProba((n) => n + 1), []);
  const ustawStrone = useCallback((nowaStrona: number) => {
    setStrona(nowaStrona);
  }, []);

  return { stan, meta, strona, ustawStrone, ponow };
}
