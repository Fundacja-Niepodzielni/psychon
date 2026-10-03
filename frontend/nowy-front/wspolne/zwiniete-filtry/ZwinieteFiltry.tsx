"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import style from "./ZwinieteFiltry.module.css";

/** Co dostaje treść panelu: `zwin` zamyka panel i oddaje fokus na wiersz (wybór opcji, „Filtruj”). */
export interface ApiZwinietychFiltrow {
  zwin: () => void;
}

interface WlasciwosciZwinietychFiltrow {
  /** Nazwa wiersza przed dwukropkiem: „Filtry”, „Rodzaj”, „Stan”. */
  etykieta: string;
  /** Wybrane wartości filtrów jednym zdaniem: „Wszystkie osoby”, „Student”. */
  podsumowanie: string;
  /** Ile jest wyników przy wybranych filtrach; bez liczby wiersz jej nie pokazuje. */
  liczba?: number;
  /** Selektor elementu panelu, który dostaje fokus po rozwinięciu; domyślnie pierwsza kontrolka. */
  fokusPoOtwarciu?: string;
  /** Kontrolki filtrów — albo funkcja, gdy treść ma zwijać panel po wyborze. */
  children: ReactNode | ((api: ApiZwinietychFiltrow) => ReactNode);
}

const PIERWSZA_KONTROLKA =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [role="combobox"], a[href]';

/**
 * Wzorzec zwiniętych filtrów listy (`.fzw`). Od 600 px nic nie zmienia: wiersz
 * jest ukryty, a kontrolki filtrów stoją w układzie rodzica (`display: contents`).
 * Poniżej 600 px zostaje jeden wiersz „Filtry: <wybrane> (N) · Zmień”, a panel
 * z kontrolkami otwiera się pod nim. Wyszukiwanie zostaje poza komponentem —
 * rodzic stawia je nad wierszem.
 *
 * Zwijanie: wybór opcji i „Filtruj” (przez `zwin`), wysłanie formularza
 * z wnętrza panelu oraz Escape (o ile kontrolka go nie obsłużyła, np. otwarta
 * lista wyboru) zamykają panel; każde zwinięcie oddaje fokus na wiersz. Napisy wiersza są
 * zwykłym tekstem w spanach — bez `aria-label`, więc nazwa przycisku jest
 * dokładnie tym, co widać.
 */
export function ZwinieteFiltry({
  etykieta,
  podsumowanie,
  liczba,
  fokusPoOtwarciu,
  children,
}: WlasciwosciZwinietychFiltrow) {
  const [rozwiniete, setRozwiniete] = useState(false);
  const idPanelu = useId();
  const wiersz = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  /** Stan z poprzedniego przebiegu efektu: fokus przenosimy tylko przy prawdziwej zmianie stanu. */
  const poprzednie = useRef(false);

  useEffect(() => {
    if (poprzednie.current === rozwiniete) return;
    poprzednie.current = rozwiniete;
    if (rozwiniete) {
      panel.current?.querySelector<HTMLElement>(fokusPoOtwarciu ?? PIERWSZA_KONTROLKA)?.focus();
    } else {
      // Zwinięcie (klik w wiersz, Escape, wybór opcji, „Filtruj”) zawsze kończy fokusem na wierszu.
      wiersz.current?.focus();
    }
  }, [rozwiniete, fokusPoOtwarciu]);

  function zwin() {
    if (rozwiniete) setRozwiniete(false);
  }

  function przelacz() {
    setRozwiniete(!rozwiniete);
  }

  function naKlawisz(zdarzenie: KeyboardEvent<HTMLDivElement>) {
    if (zdarzenie.key === "Escape" && rozwiniete && !zdarzenie.defaultPrevented) zwin();
  }

  return (
    <div
      className={rozwiniete ? `${style.fzw} ${style.rozwiniete}` : style.fzw}
      data-rozwiniete={rozwiniete}
      onKeyDown={naKlawisz}
      onSubmit={zwin}
    >
      <button
        ref={wiersz}
        type="button"
        className={style.wiersz}
        aria-expanded={rozwiniete}
        aria-controls={idPanelu}
        onClick={przelacz}
      >
        <span className={style.opis}>
          <span className={style.etykieta}>{etykieta}:</span>{" "}
          <span className={style.wybrane}>{podsumowanie}</span>
          {liczba !== undefined && (
            <>
              {" "}
              <span className={style.licznik}>({liczba})</span>
            </>
          )}
        </span>{" "}
        <span className={style.akcja}>
          <span>{rozwiniete ? "Zwiń" : "Zmień"}</span>
          <svg className={style.strzalka} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      <div id={idPanelu} ref={panel} className={style.panel}>
        {typeof children === "function" ? children({ zwin }) : children}
      </div>
    </div>
  );
}
