import { useEffect, useRef } from "react";
import { Button } from "../../atomy/Button/Button";
import style from "./DialogActions.module.css";

interface WlasciwosciDialogActions {
  etykietaWycofania: string;
  etykietaPotwierdzenia: string;
  onWycofaj: () => void;
  onPotwierdz: () => void;
  /** Potwierdzenie destrukcyjne (np. usunięcie) — nadal `primary`, nigdy taki sam jak wycofanie. */
  niebezpieczne?: boolean;
}

/**
 * Rząd przycisków okna `DialogActions` (M12). Wycofanie zawsze po lewej,
 * `quiet`; potwierdzenie zawsze po prawej, `primary` — nigdy ten sam wariant
 * (ustalenie specyfikacji). Fokus początkowy na WYCOFANIU (M12): otwarcie okna
 * nie ma domyślnie ustawionego fokusu na akcji nieodwracalnej.
 */
export function DialogActions({
  etykietaWycofania,
  etykietaPotwierdzenia,
  onWycofaj,
  onPotwierdz,
  niebezpieczne = false,
}: WlasciwosciDialogActions) {
  const rzad = useRef<HTMLDivElement>(null);

  // Button (A1) nie przyjmuje `ref` — fokus początkowy ustawiany tym samym
  // sposobem co FocusDemo w katalog-komponentow/b (querySelector po
  // zamontowaniu), nie forwardRef na atomie.
  useEffect(() => {
    rzad.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
  }, []);

  return (
    <div ref={rzad} className={style.rzad}>
      <Button poziom="quiet" onClick={onWycofaj}>
        {etykietaWycofania}
      </Button>
      <Button poziom="primary" niebezpieczny={niebezpieczne} onClick={onPotwierdz}>
        {etykietaPotwierdzenia}
      </Button>
    </div>
  );
}
