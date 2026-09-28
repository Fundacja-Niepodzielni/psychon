"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Heading } from "../../atomy/Heading/Heading";
import { DialogActions } from "../../molekuly/DialogActions/DialogActions";
import style from "./Dialog.module.css";

interface WlasciwosciDialog {
  tytul: string;
  /** Treść okna — `Text` albo `Field`, przekazane przez wywołującego; ten
   * organizm nie zakłada, które z nich, tylko je opakowuje — służy wyłącznie
   * do potwierdzenia i krótkiego pytania. */
  children: ReactNode;
  etykietaWycofania: string;
  etykietaPotwierdzenia: string;
  onWycofaj: () => void;
  onPotwierdz: () => void;
  /** Potwierdzenie destrukcyjne — przekazywane wprost do `DialogActions`. */
  niebezpieczne?: boolean;
}

/**
 * Okno `Dialog`. `Heading` + treść (`Text`/`Field`) + `DialogActions` —
 * fokus początkowy na wycofaniu jest już zaimplementowany w tej molekule,
 * nie powtarzany tu. Jedna nazwana warstwa (`--z-scrim`) i jedna
 * implementacja — okno służy WYŁĄCZNIE do potwierdzenia i krótkiego
 * pytania; edycja rekordu zostaje przy wierszu, poza tym organizmem.
 *
 * Wyjście (klawisz Escape) i klik w przesłonę wołają `onWycofaj` — ten sam
 * skutek co przycisk wycofania, jedna droga zamknięcia. Enter zatwierdza
 * (`onPotwierdz`) WYŁĄCZNIE gdy jego celem jest pole tekstowe (`input`
 * o typie innym niż checkbox/radio/przycisk) — nigdy z przycisku (w tym
 * wycofania) ani z kontrolki wyboru (`role="combobox"`), żeby Enter
 * naciśnięty na fokusie „Anuluj” nie zatwierdzał okna zamiast je zamykać.
 * Pole wieloliniowe (`Textarea`) nie jest `input`, więc już samo przez to
 * zostaje poza tą listą — Enter w nim wstawia nową linię, tak samo jak
 * w zwykłym formularzu HTML.
 *
 * Fokus po zamknięciu wraca do elementu aktywnego PRZED zamontowaniem tego
 * okna (przycisk wołający): zmierzony z `document.activeElement` w efekcie
 * montowania, przywrócony w jego sprzątaniu przy odmontowaniu — ten sam
 * wzorzec co odzyskiwanie fokusu w bocznej szufladzie nawigacji (szuflada
 * oddaje fokus przyciskowi, który ją otworzyła).
 *
 * Pułapka fokusu: `Tab`/`Shift+Tab` krążą WYŁĄCZNIE po elementach
 * fokusowalnych wewnątrz okna (`aria-modal="true"` ma tu pokrycie w
 * zachowaniu, nie tylko w atrybucie) — z ostatniego elementu `Tab` wraca na
 * pierwszy, z pierwszego `Shift+Tab` przechodzi na ostatni, fokus spoza
 * okna (np. po kliknięciu myszą gdzie indziej) wraca na pierwszy element.
 *
 * Ograniczenie jawne, nie zmierzone i nie ukryte: „wejście na inny ekran
 * zamyka wszystkie” (nawigacja usuwa WSZYSTKIE otwarte okna) jest regułą
 * routingu aplikacji — ten plik nie zna trasy ani stosu okien, więc nie
 * może tego wymusić sam. Właściciel: warstwa routingu wywołującej strony,
 * poza zakresem tego pliku.
 */
const SELEKTOR_FOKUSOWALNYCH =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="combobox"], [tabindex]:not([tabindex="-1"])';
export function Dialog({
  tytul,
  children,
  etykietaWycofania,
  etykietaPotwierdzenia,
  onWycofaj,
  onPotwierdz,
  niebezpieczne = false,
}: WlasciwosciDialog) {
  const idNaglowka = useId();
  // Przechwycone w LENIWYM INICJALIZATORZE `useState`, nie w efekcie:
  // `DialogActions` (dziecko) ma WŁASNY efekt, który przenosi fokus na
  // przycisk wycofania zaraz po zamontowaniu — efekty dziecka odpalają się
  // PRZED efektem rodzica (React idzie od dołu drzewa w górę), więc
  // przechwycenie w efekcie TEGO komponentu widziałoby już skradziony
  // fokus, nie prawdziwy element wołający. Inicjalizator `useState`
  // wykonuje się RAZ, w trakcie pierwszego renderu, PRZED jakimkolwiek
  // efektem całego poddrzewa — to jedyny moment, w którym
  // `document.activeElement` jest jeszcze elementem sprzed zamontowania
  // okna. Ref czytany w renderze byłby tu błędem (react-hooks/refs) — stan
  // jest właściwym narzędziem na wartość obliczoną raz przy montowaniu.
  const [elementSprzedOtwarciem] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null),
  );

  const oknoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      elementSprzedOtwarciem?.focus?.();
    };
  }, [elementSprzedOtwarciem]);

  useEffect(() => {
    function naKlawisz(zdarzenie: KeyboardEvent) {
      if (zdarzenie.key === "Escape") {
        zdarzenie.preventDefault();
        onWycofaj();
        return;
      }
      if (zdarzenie.key === "Enter") {
        const cel = zdarzenie.target as HTMLElement | null;
        const polePotwierdzajace =
          cel?.tagName === "INPUT" &&
          !["checkbox", "radio", "button", "submit", "reset"].includes(
            (cel as HTMLInputElement).type,
          );
        if (!polePotwierdzajace) return;
        zdarzenie.preventDefault();
        onPotwierdz();
        return;
      }
      if (zdarzenie.key === "Tab") {
        const kontener = oknoRef.current;
        if (!kontener) return;
        const fokusowalne = Array.from(
          kontener.querySelectorAll<HTMLElement>(SELEKTOR_FOKUSOWALNYCH),
        );
        if (fokusowalne.length === 0) return;
        const pierwszy = fokusowalne[0];
        const ostatni = fokusowalne[fokusowalne.length - 1];
        const aktywny = document.activeElement as HTMLElement | null;
        if (zdarzenie.shiftKey) {
          if (aktywny === pierwszy || !kontener.contains(aktywny)) {
            zdarzenie.preventDefault();
            ostatni.focus();
          }
        } else if (aktywny === ostatni || !kontener.contains(aktywny)) {
          zdarzenie.preventDefault();
          pierwszy.focus();
        }
      }
    }
    document.addEventListener("keydown", naKlawisz);
    return () => document.removeEventListener("keydown", naKlawisz);
  }, [onWycofaj, onPotwierdz]);

  return (
    <div className={style.przeslona} onClick={onWycofaj}>
      <div
        ref={oknoRef}
        className={style.okno}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idNaglowka}
        onClick={(zdarzenie) => zdarzenie.stopPropagation()}
      >
        <Heading stopien={2} id={idNaglowka}>
          {tytul}
        </Heading>
        <div className={style.tresc}>{children}</div>
        <DialogActions
          etykietaWycofania={etykietaWycofania}
          etykietaPotwierdzenia={etykietaPotwierdzenia}
          onWycofaj={onWycofaj}
          onPotwierdz={onPotwierdz}
          niebezpieczne={niebezpieczne}
        />
      </div>
    </div>
  );
}
