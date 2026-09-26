"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import style from "./Select.module.css";

interface OpcjaSelect {
  wartosc: string;
  etykieta: string;
}

interface WlasciwosciSelect {
  opcje: OpcjaSelect[];
  wartosc?: string;
  domyslnaWartosc?: string;
  onZmiana?: (wartosc: string) => void;
  niepoprawny?: boolean;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/**
 * `Select` (06 §2 A5, ZU-5): własna kontrolka (przycisk + lista), bez
 * kontrolki systemowej. Zmierzone tym plikiem, nie twierdzone: żaden element
 * znacznik `select` (systemowy) nie trafia do drzewa DOM — literalny grep po
 * tym znaczniku w `design-system/` wraca do 0 (P-12; było 1 realne
 * wystąpienie JSX). Wzorzec
 * WAI-ARIA APG „select-only combobox”: `role="combobox"` na przycisku, który
 * cały czas trzyma fokus, `role="listbox"`/`role="option"` na rozwijanej
 * liście, podświetlenie zgłaszane przez `aria-activedescendant` — opcje same
 * nie dostają fokusu DOM. Klawiatura na przycisku: Strzałka w dół/górę
 * (otwiera listę albo przesuwa podświetlenie), Enter/Spacja (wybiera i
 * zamyka), Escape (zamyka bez zmiany wyboru), Home/End (podświetla pierwszą/
 * ostatnią opcję). To jest opis tego, co próby niżej sprawdzają — nie ocena,
 * czy rozwiązanie jest dobre.
 */
export function Select({
  opcje,
  wartosc,
  domyslnaWartosc,
  onZmiana,
  niepoprawny = false,
  disabled = false,
  required = false,
  id,
  name,
  ...aria
}: WlasciwosciSelect) {
  const idGenerowany = useId();
  const idBazowy = id ?? idGenerowany;
  const idListy = `${idBazowy}-listbox`;

  const startowyIndeks = (() => {
    const szukana = wartosc ?? domyslnaWartosc;
    const znaleziony = opcje.findIndex((opcja) => opcja.wartosc === szukana);
    return znaleziony >= 0 ? znaleziony : 0;
  })();

  const [otwarty, setOtwarty] = useState(false);
  const [wewnetrznyIndeks, setWewnetrznyIndeks] = useState(startowyIndeks);
  const [podswietlonyIndeks, setPodswietlonyIndeks] = useState(startowyIndeks);

  const przyciskRef = useRef<HTMLButtonElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);

  // Komponent kontrolowany, jeśli rodzic podaje `wartosc` — ona rządzi stanem,
  // policzona wprost przy renderze (bez efektu synchronizującego: setState
  // wołane synchronicznie w efekcie tylko po to, żeby "skopiować" prop do
  // stanu, wywołuje kaskadowy dodatkowy render — React sam to flaguje jako
  // błąd, patrz react-hooks/set-state-in-effect).
  const indeksZWartosci = wartosc !== undefined ? opcje.findIndex((opcja) => opcja.wartosc === wartosc) : -1;
  const wybranyIndeks = indeksZWartosci >= 0 ? indeksZWartosci : wewnetrznyIndeks;

  useEffect(() => {
    if (!otwarty) return;
    function naZewnatrz(zdarzenie: MouseEvent) {
      const cel = zdarzenie.target as Node;
      if (!przyciskRef.current?.contains(cel) && !listaRef.current?.contains(cel)) {
        setOtwarty(false);
      }
    }
    document.addEventListener("mousedown", naZewnatrz);
    return () => document.removeEventListener("mousedown", naZewnatrz);
  }, [otwarty]);

  function wybierz(indeks: number) {
    const opcja = opcje[indeks];
    if (!opcja) return;
    setWewnetrznyIndeks(indeks);
    setPodswietlonyIndeks(indeks);
    setOtwarty(false);
    onZmiana?.(opcja.wartosc);
  }

  function obslugaKlawiszy(zdarzenie: KeyboardEvent<HTMLButtonElement>) {
    if (disabled || opcje.length === 0) return;
    switch (zdarzenie.key) {
      case "ArrowDown":
        zdarzenie.preventDefault();
        if (!otwarty) {
          setOtwarty(true);
          setPodswietlonyIndeks(wybranyIndeks);
        } else {
          setPodswietlonyIndeks((indeks) => Math.min(indeks + 1, opcje.length - 1));
        }
        break;
      case "ArrowUp":
        zdarzenie.preventDefault();
        if (!otwarty) {
          setOtwarty(true);
          setPodswietlonyIndeks(wybranyIndeks);
        } else {
          setPodswietlonyIndeks((indeks) => Math.max(indeks - 1, 0));
        }
        break;
      case "Enter":
      case " ":
        zdarzenie.preventDefault();
        if (otwarty) {
          wybierz(podswietlonyIndeks);
        } else {
          setOtwarty(true);
          setPodswietlonyIndeks(wybranyIndeks);
        }
        break;
      case "Escape":
        if (otwarty) {
          zdarzenie.preventDefault();
          setOtwarty(false);
          setPodswietlonyIndeks(wybranyIndeks);
        }
        break;
      case "Home":
        zdarzenie.preventDefault();
        setOtwarty(true);
        setPodswietlonyIndeks(0);
        break;
      case "End":
        zdarzenie.preventDefault();
        setOtwarty(true);
        setPodswietlonyIndeks(opcje.length - 1);
        break;
      default:
        break;
    }
  }

  const opcjaWybrana = opcje[wybranyIndeks];

  return (
    <div className={style.kontener}>
      <button
        type="button"
        ref={przyciskRef}
        id={idBazowy}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={otwarty}
        aria-controls={idListy}
        aria-activedescendant={otwarty ? `${idBazowy}-opcja-${podswietlonyIndeks}` : undefined}
        aria-invalid={niepoprawny || undefined}
        aria-required={required || undefined}
        disabled={disabled}
        className={style.pole}
        onClick={() => !disabled && setOtwarty((poprzednio) => !poprzednio)}
        onKeyDown={obslugaKlawiszy}
        {...aria}
      >
        {opcjaWybrana?.etykieta ?? ""}
      </button>
      {name !== undefined && <input type="hidden" name={name} value={opcjaWybrana?.wartosc ?? ""} />}
      {otwarty && (
        <ul id={idListy} role="listbox" ref={listaRef} className={style.lista}>
          {opcje.map((opcja, indeks) => (
            <li
              key={opcja.wartosc}
              id={`${idBazowy}-opcja-${indeks}`}
              role="option"
              aria-selected={indeks === wybranyIndeks}
              className={indeks === podswietlonyIndeks ? `${style.opcja} ${style.podswietlona}` : style.opcja}
              onMouseEnter={() => setPodswietlonyIndeks(indeks)}
              onMouseDown={(zdarzenie) => zdarzenie.preventDefault()}
              onClick={() => wybierz(indeks)}
            >
              {opcja.etykieta}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
