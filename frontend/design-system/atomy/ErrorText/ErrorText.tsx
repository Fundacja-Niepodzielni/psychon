import type { ReactNode } from "react";
import style from "./ErrorText.module.css";

interface WlasciwosciErrorText {
  id: string;
  children?: ReactNode;
}

/**
 * Tekst błędu `ErrorText` (A11). Błąd stoi przy polu, nie tylko w
 * podsumowaniu. Gdy treści nie ma (błąd poprawiony), atom nic nie renderuje —
 * znika razem z `aria-invalid` po stronie kontrolki.
 */
export function ErrorText({ id, children }: WlasciwosciErrorText) {
  if (!children) {
    return null;
  }
  return (
    <p id={id} role="alert" className={style.blad}>
      <span className={style.znacznik} aria-hidden="true">
        !
      </span>
      {children}
    </p>
  );
}
