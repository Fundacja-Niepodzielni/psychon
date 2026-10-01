"use client";

import { useSyncExternalStore } from "react";
import { BRAK_WYSYLANIA, uchwytWysylania, type StanWysylania } from "./uchwyt";

const naSerwerze = () => BRAK_WYSYLANIA;

/** Stan wysyłania nagrania — ten sam na każdym ekranie panelu. */
export function useWysylanie(): StanWysylania {
  return useSyncExternalStore(uchwytWysylania.subskrybuj, uchwytWysylania.stan, naSerwerze);
}

/** Stan wysyłania nagrania tej jednej lekcji; `null`, gdy uchwyt nie ma nic o tej lekcji. */
export function useWysylanieLekcji(idLekcji: number): Exclude<StanWysylania, { rodzaj: "brak" }> | null {
  const stan = useWysylanie();
  return stan.rodzaj !== "brak" && stan.lekcja.id === idLekcji ? stan : null;
}
