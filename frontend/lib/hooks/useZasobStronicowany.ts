"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

/**
 * Hak stronicowanego pobrania (C2 wariant C, część 3 „Haki danych").
 * Zastępuje 9 niezależnych implementacji stronicowania — każda wywoływała
 * `apiPaged` z ręcznym `page`, `meta`, `loading`, `error` osobno. Tu jest to
 * jedno miejsce: `pobierz(strona)` woła `apiPaged`-owy eksport `lib/api.ts`.
 */
export function useZasobStronicowany<T>(
  pobierz: (
    strona: number,
  ) => Promise<{ data: T[]; meta?: PaginationMeta }>,
  zaleznosci: readonly unknown[] = [],
  komunikatBledu: string = DOMYSLNY_KOMUNIKAT_BLEDU,
): UseZasobStronicowanegoResult<T> {
  const [strona, setStrona] = useState(1);
  const [stan, setStan] = useState<StanZasobu<T[]>>({ status: "loading" });
  const [meta, setMeta] = useState<PaginationMeta | undefined>(undefined);
  const [proba, setProba] = useState(0);
  const pobierzRef = useRef(pobierz);
  pobierzRef.current = pobierz;

  useEffect(() => {
    let aktywny = true;
    setStan({ status: "loading" });

    pobierzRef
      .current(strona)
      .then(({ data, meta: pagination }) => {
        if (!aktywny) return;
        setStan({ status: "success", data });
        setMeta(pagination);
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
  }, [strona, proba, komunikatBledu, ...zaleznosci]);

  const ponow = useCallback(() => setProba((n) => n + 1), []);
  const ustawStrone = useCallback((nowaStrona: number) => {
    setStrona(nowaStrona);
  }, []);

  return { stan, meta, strona, ustawStrone, ponow };
}
