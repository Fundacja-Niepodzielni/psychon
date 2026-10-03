"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon, type NazwaIkony } from "../../atomy/Icon/Icon";
import style from "./MenuOpcji.module.css";

export interface PozycjaMenuOpcji {
  /** Stały identyfikator pozycji (klucz i `data-pozycja`). */
  id: string;
  etykieta: string;
  onWybierz: () => void;
  /** Pozycja nieodwracalna (usunięcie) — barwa błędu. */
  niebezpieczna?: boolean;
  /** Cienka linia nad pozycją, oddzielająca ją od poprzednich. */
  liniaPrzed?: boolean;
}

interface WlasciwosciMenuOpcji {
  /** Nazwa przycisku, np. „Opcje tematu Praktyka”; menu dostaje tę samą nazwę. */
  etykieta: string;
  pozycje: PozycjaMenuOpcji[];
  ikona?: NazwaIkony;
  /** Znacznik `data-fokus` na przycisku — ekran wraca nim fokusem po zmianie układu. */
  znacznikFokusu?: string;
}

/**
 * Przycisk z ikoną otwierający listę opcji (wzorzec „menu”: `aria-haspopup`,
 * `aria-expanded`, pozycje `menuitem`). Po otwarciu fokus trafia na pierwszą
 * pozycję; strzałki w górę i w dół przechodzą po pozycjach w kółko, Home i End —
 * na pierwszą i ostatnią. Escape, kliknięcie poza menu (w puste miejsce) i wybór pozycji zamykają
 * menu i oddają fokus przyciskowi; Tab zamyka menu i zostawia fokus tam, dokąd
 * poszedł. Molekuła nie wie, co robią pozycje — woła `onWybierz`.
 */
export function MenuOpcji({ etykieta, pozycje, ikona = "olowek", znacznikFokusu }: WlasciwosciMenuOpcji) {
  const [otwarte, setOtwarte] = useState(false);
  const korzen = useRef<HTMLDivElement>(null);
  const przycisk = useRef<HTMLButtonElement>(null);
  const idMenu = useId();

  useEffect(() => {
    if (!otwarte) return;
    korzen.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [otwarte]);

  useEffect(() => {
    if (!otwarte) return;
    function naKlik(zdarzenie: MouseEvent) {
      if (korzen.current && !korzen.current.contains(zdarzenie.target as Node)) {
        setOtwarte(false);
        // Kliknięcie w puste miejsce odbiera fokus po tym zdarzeniu — oddajemy go ołówkowi dopiero wtedy,
        // i tylko jeśli nie trafił na inny element (kliknięty przycisk albo pole zachowuje fokus).
        window.setTimeout(() => {
          const aktywny = document.activeElement;
          if (!aktywny || aktywny === document.body) przycisk.current?.focus();
        }, 0);
      }
    }
    document.addEventListener("mousedown", naKlik);
    return () => document.removeEventListener("mousedown", naKlik);
  }, [otwarte]);

  function zamknijIOddajFokus() {
    setOtwarte(false);
    przycisk.current?.focus();
  }

  function naKlawisz(zdarzenie: KeyboardEvent<HTMLDivElement>) {
    if (!otwarte) return;
    if (zdarzenie.key === "Escape") {
      zdarzenie.stopPropagation();
      zdarzenie.preventDefault();
      zamknijIOddajFokus();
      return;
    }
    if (zdarzenie.key === "Tab") {
      setOtwarte(false);
      return;
    }
    const wiersze = Array.from(korzen.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const biezacy = wiersze.indexOf(document.activeElement as HTMLElement);
    let nastepny: number | null = null;
    if (zdarzenie.key === "ArrowDown") nastepny = (biezacy + 1) % wiersze.length;
    else if (zdarzenie.key === "ArrowUp") nastepny = (biezacy <= 0 ? wiersze.length : biezacy) - 1;
    else if (zdarzenie.key === "Home") nastepny = 0;
    else if (zdarzenie.key === "End") nastepny = wiersze.length - 1;
    if (nastepny === null || wiersze.length === 0) return;
    zdarzenie.preventDefault();
    wiersze[nastepny]?.focus();
  }

  return (
    <div ref={korzen} className={style.opcje} onKeyDown={naKlawisz}>
      <button
        ref={przycisk}
        type="button"
        className={style.przycisk}
        aria-label={etykieta}
        aria-haspopup="menu"
        aria-expanded={otwarte}
        aria-controls={otwarte ? idMenu : undefined}
        data-fokus={znacznikFokusu}
        onClick={() => setOtwarte((poprzednie) => !poprzednie)}
        onKeyDown={(zdarzenie) => {
          if (zdarzenie.key === "ArrowDown" && !otwarte) {
            zdarzenie.preventDefault();
            setOtwarte(true);
          }
        }}
      >
        <Icon nazwa={ikona} rozmiar={18} />
      </button>
      {otwarte && (
        <ul id={idMenu} role="menu" aria-label={etykieta} className={style.menu}>
          {pozycje.map((pozycja) => (
            <li key={pozycja.id} role="none" className={pozycja.liniaPrzed ? style.zLinia : undefined}>
              {pozycja.liniaPrzed && <div role="separator" className={style.linia} />}
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                data-pozycja={pozycja.id}
                className={`${style.pozycja} ${pozycja.niebezpieczna ? style.niebezpieczna : ""}`.trim()}
                onClick={() => {
                  zamknijIOddajFokus();
                  pozycja.onWybierz();
                }}
              >
                {pozycja.etykieta}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
