"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, type PaginationMeta } from "@/lib/api";

/**
 * Stan pojedynczego pobrania — jeden z trzech, nigdy kombinacja
 * `loading` + `error` osobnymi zmiennymi (to właśnie 37 kopii z KC-4).
 *
 * `httpStatus` niesie `ApiError.status` (gdy błąd nim jest) dalej niż sam
 * komunikat — bez tego ekran nie umie odróżnić 403 („brak uprawnień") od
 * awarii serwera i pokazuje `ErrorState` w obu przypadkach.
 */
export type StanZasobu<T> =
  | { status: "loading" }
  | { status: "error"; message: string; httpStatus?: number }
  | { status: "success"; data: T };

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
    | { status: "error"; message: string; httpStatus?: number };
}

/**
 * Hak stronicowanego pobrania (C2 wariant C, część 3 „Haki danych").
 * Zastępuje 9 niezależnych implementacji stronicowania — każda wywoływała
 * `apiPaged` z ręcznym `page`, `meta`, `loading`, `error` osobno. Tu jest to
 * jedno miejsce: `pobierz(strona)` woła `apiPaged`-owy eksport `lib/api.ts`.
 *
 * Służy też pobraniom niestronicowanym z jednym wywołującym (np. katalog
 * kursów uczestnika, `panel/kursy`) — `pobierz` po prostu ignoruje `strona`
 * i zwraca `{ data }` bez `meta`; osobny hak tylko dla tego jednego ekranu
 * (dawny `useZasob`, 1 wywołujący — łamał regułę C2 „żaden komponent bez co
 * najmniej 2 użyć") dublowałby ten sam cykl życia (ładowanie → sukces/błąd,
 * z ponowieniem) bez żadnej innej różnicy niż brak `strona`/`meta`.
 *
 * Stan „ładowanie" jest wyprowadzony (porównanie klucza żądania z ostatnio
 * rozstrzygniętym), nie ustawiany wprost na starcie efektu — bezpośrednie
 * `setState` w ciele efektu kaskaduje renderowania
 * (react-hooks/set-state-in-effect).
 *
 * `zaleznosci` działa jak druga tablica zależności `useEffect` (np. filtr) —
 * zmiana elementu odpytuje serwer ponownie.
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

  const klucz = `${strona}:${proba}:${JSON.stringify(zaleznosci)}`;

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
            httpStatus: err instanceof ApiError ? err.status : undefined,
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
      : {
          status: "error",
          message: rozstrzygniety.message,
          httpStatus: rozstrzygniety.httpStatus,
        };
  const meta =
    rozstrzygniety && rozstrzygniety.status === "success" ? rozstrzygniety.meta : undefined;

  const ponow = useCallback(() => setProba((n) => n + 1), []);
  const ustawStrone = useCallback((nowaStrona: number) => {
    setStrona(nowaStrona);
  }, []);

  return { stan, meta, strona, ustawStrone, ponow };
}
