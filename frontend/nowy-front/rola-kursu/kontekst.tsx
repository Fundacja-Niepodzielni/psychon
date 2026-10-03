"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { konfiguracjaRoli, type KonfiguracjaRoliKursu, type RolaKursu } from "./rola";

/** Bez dostawcy ekran działa w roli administracji — tak jak przed wprowadzeniem roli. */
const KontekstRoliKursu = createContext<KonfiguracjaRoliKursu>(konfiguracjaRoli("admin"));

export function DostawcaRoliKursu({ rola, children }: { rola: RolaKursu; children: ReactNode }) {
  const wartosc = useMemo(() => konfiguracjaRoli(rola), [rola]);
  return <KontekstRoliKursu.Provider value={wartosc}>{children}</KontekstRoliKursu.Provider>;
}

/** Konfiguracja roli ekranu kursu i strony lekcji: warstwa danych, adresy i elementy tylko dla administracji. */
export function useRolaKursu(): KonfiguracjaRoliKursu {
  return useContext(KontekstRoliKursu);
}
