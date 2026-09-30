"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Kontekst powłoki panelu. Szablon ekranu renderowany poza powłoką jest sam
 * punktem orientacyjnym treści (`<main id="tresc" tabIndex={-1}>`, cel linku
 * skoku). Powłoka panelu (menu boczne, nagłówek) niesie własny `main` pod
 * `id="tresc"` i własny link skoku — wtedy szablon nie może dokładać drugiego
 * `main` ani drugiego `id="tresc"`, więc renderuje zwykły `div` z tą samą
 * klasą i tym samym `data-style-id`.
 *
 * Domyślnie (brak dostawcy) kontekst jest fałszywy i szablon wygląda dokładnie
 * tak jak dotąd.
 */
const KontekstPowloki = createContext(false);

/** Dostawca: wszystko wewnątrz jest renderowane pod powłoką panelu. */
export function DostawcaPowloki({ children }: { children: ReactNode }) {
  return <KontekstPowloki.Provider value={true}>{children}</KontekstPowloki.Provider>;
}

/** Hak: prawda, gdy szablon stoi wewnątrz powłoki panelu. */
export function useWPowloce(): boolean {
  return useContext(KontekstPowloki);
}

interface WlasciwosciKorzeniaSzablonu {
  className: string;
  /** Wartość `data-style-id` korzenia szablonu. */
  styleId: string;
  children: ReactNode;
}

/**
 * Wspólny korzeń sześciu szablonów. Poza powłoką: `main` z `id="tresc"`
 * i `tabIndex={-1}`. W powłoce: `div` bez `id` i bez `tabIndex`, z tą samą
 * klasą i tym samym `data-style-id`.
 */
export function KorzenSzablonu({ className, styleId, children }: WlasciwosciKorzeniaSzablonu) {
  const wPowloce = useWPowloce();

  if (wPowloce) {
    return (
      <div className={className} data-style-id={styleId}>
        {children}
      </div>
    );
  }

  return (
    <main id="tresc" tabIndex={-1} className={className} data-style-id={styleId}>
      {children}
    </main>
  );
}
