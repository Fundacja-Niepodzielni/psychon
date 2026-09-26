import type { ReactNode } from "react";
import style from "./Hint.module.css";

interface WlasciwosciHint {
  id?: string;
  children: ReactNode;
}

/**
 * Podpowiedź `Hint` (A10). Jedna implementacja, niezależnie od miejsca użycia
 * (pod kontrolką, w nagłówku pojemnika, w wierszu) — bez osobnych nazw klas.
 * Nie powtarza etykiety kontrolki.
 */
export function Hint({ id, children }: WlasciwosciHint) {
  return (
    <p id={id} className={style.podpowiedz}>
      {children}
    </p>
  );
}
