import { useEffect, useRef, type MouseEvent } from "react";
import { Button } from "../../atomy/Button/Button";
import style from "./DialogActions.module.css";

interface WlasciwosciDialogActions {
  etykietaWycofania: string;
  etykietaPotwierdzenia: string;
  onWycofaj: () => void;
  /** Przy `typPotwierdzenia="submit"` może zostać pominięte — zapis idzie zdarzeniem formularza. */
  onPotwierdz?: () => void;
  /**
   * Potwierdzenie destrukcyjne (np. usunięcie, porzucenie danych). Przycisk główny
   * (`primary`, z fokusem początkowym) jest wtedy bezpiecznym wycofaniem, a
   * potwierdzenie — drugorzędne w wariancie ostrzegawczym (`outline` z napisem w
   * barwie błędu). Napis w barwie błędu nigdy nie stoi na wypełnionym tle.
   */
  niebezpieczne?: boolean;
  /**
   * `submit` — potwierdzenie wysyła formularz, w którym stoi rząd (Enter w polu
   * działa jak na stronie), a wycofanie dostaje `type="button"`, żeby go nie
   * wysyłało. Bez tej właściwości oba przyciski renderują się jak dotąd.
   */
  typPotwierdzenia?: "button" | "submit";
  /**
   * Trwa zapis: potwierdzenie mówi `etykietaZapisywania` i jest niedostępne
   * (`aria-disabled`, nie `disabled` — przycisk z fokusem go nie gubi),
   * a kliknięcie w nie niczego nie wysyła.
   */
  zapisywanie?: boolean;
  etykietaZapisywania?: string;
  /** Fokus na wycofaniu po zamontowaniu. Domyślnie tak; okno formularza ustawia fokus samo. */
  fokusPrzyOtwarciu?: boolean;
}

/**
 * Rząd przycisków okna `DialogActions` (M12). Wycofanie zawsze po lewej,
 * `quiet`; potwierdzenie zawsze po prawej, `primary` — nigdy ten sam wariant
 * (ustalenie specyfikacji). Przy `niebezpieczne` role się odwracają: wycofanie
 * jest przyciskiem głównym, a potwierdzenie `outline` z napisem w barwie błędu.
 * Fokus początkowy na WYCOFANIU (M12): otwarcie okna nie ma domyślnie
 * ustawionego fokusu na akcji nieodwracalnej.
 */
export function DialogActions({
  etykietaWycofania,
  etykietaPotwierdzenia,
  onWycofaj,
  onPotwierdz,
  niebezpieczne = false,
  typPotwierdzenia,
  zapisywanie = false,
  etykietaZapisywania = "Zapisywanie…",
  fokusPrzyOtwarciu = true,
}: WlasciwosciDialogActions) {
  const rzad = useRef<HTMLDivElement>(null);

  // Button (A1) nie przyjmuje `ref` — fokus początkowy ustawiany tym samym
  // sposobem co FocusDemo w katalog-komponentow/b (querySelector po
  // zamontowaniu), nie forwardRef na atomie.
  useEffect(() => {
    if (!fokusPrzyOtwarciu) return;
    rzad.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    // Wyłącznie przy zamontowaniu — zmiana propu później nie przenosi fokusu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function naPotwierdzenie(zdarzenie: MouseEvent<HTMLButtonElement>) {
    if (zapisywanie) {
      // Drugie wysłanie w trakcie zapisu nie wychodzi — także przez submit formularza.
      zdarzenie.preventDefault();
      return;
    }
    onPotwierdz?.();
  }

  return (
    <div ref={rzad} className={style.rzad}>
      <Button
        poziom={niebezpieczne ? "primary" : "quiet"}
        type={typPotwierdzenia === "submit" ? "button" : undefined}
        onClick={onWycofaj}
      >
        {etykietaWycofania}
      </Button>
      <Button
        poziom={niebezpieczne ? "outline" : "primary"}
        type={typPotwierdzenia}
        niebezpieczny={niebezpieczne}
        aria-disabled={zapisywanie ? true : undefined}
        onClick={naPotwierdzenie}
      >
        {zapisywanie ? etykietaZapisywania : etykietaPotwierdzenia}
      </Button>
    </div>
  );
}
