"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Kontekst nowej ramki panelu (szablon `PowlokaPanelu`, ramka z makiety
 * 2.0.4). Znaczy wyłącznie „ekran stoi w nowej ramce” — w odróżnieniu od
 * `DostawcaPowloki` (`KontekstPowloki.tsx`), który znaczy „`main` niesie już
 * powłoka” i stoi także w dotychczasowym `PanelShell`.
 *
 * Wstawia go tylko `PowlokaPanelu`. Nagłówek ekranu (`PageHeader`) w nowej
 * ramce nie ma przycisku „Wstecz” i pokazuje okruszki tylko z łączami; poza
 * nią (stara powłoka, poligon) — zachowanie jak dotąd.
 */
const KontekstRamki = createContext(false);

/** Dostawca: wszystko wewnątrz stoi w nowej ramce panelu. */
export function DostawcaRamki({ children }: { children: ReactNode }) {
  return <KontekstRamki.Provider value={true}>{children}</KontekstRamki.Provider>;
}

/** Hak: prawda, gdy ekran stoi w nowej ramce panelu. */
export function useWRamce(): boolean {
  return useContext(KontekstRamki);
}
