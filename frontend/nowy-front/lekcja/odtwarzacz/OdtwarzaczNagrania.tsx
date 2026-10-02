"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { ZrodloNagrania } from "../dane";
import { numerMinuty } from "../stan";
import style from "./OdtwarzaczNagrania.module.css";

/**
 * JEDYNE miejsce ekranu lekcji, w którym stoi odtwarzacz nagrania. Ekran nie
 * zna niczego, co leży za tym punktem: dostaje go jako jeden komponent z jednym
 * zestawem właściwości, więc podmiana ramki odtwarzacza dostawcy nagrań to
 * zamiana tego jednego pliku (i jego stylów) przy tych samych właściwościach.
 *
 * Właściwości wchodzące: `zrodlo` (adresy z odczytu `video-link`),
 * `czasTrwaniaSekund`, `pozycjaStartowaSekundy` (od niej nagranie startuje;
 * `0` = od początku; czytana przy zamontowaniu — nowa lekcja albo nowa pozycja
 * z odczytu to nowy egzemplarz, ekran nadaje mu klucz). Zdarzenia wychodzące: `onZmianaOdtwarzania` (gra / stoi),
 * `onSekunda` (jedna odegrana sekunda, z pozycją bezwzględną — z niej ekran
 * liczy czas oglądania i pozycję do zapisu), `onZmianaPozycji` (skok: przewinięcie
 * albo „Odtwórz od początku”), `onKoniec` i `onBlad`.
 *
 * Ta wersja jest atrapą ramki: bez elementu nagrania i bez żądań sieciowych, z
 * własnym zegarem — jedna sekunda zegara to jedna sekunda nagrania. Adresów ze
 * `zrodlo` nie używa.
 */
export interface WlasciwosciOdtwarzaczaNagrania {
  zrodlo?: ZrodloNagrania;
  czasTrwaniaSekund: number;
  pozycjaStartowaSekundy: number;
  onZmianaOdtwarzania: (odtwarza: boolean) => void;
  onSekunda: (pozycjaSekund: number) => void;
  onZmianaPozycji?: (pozycjaSekund: number) => void;
  onKoniec?: () => void;
  onBlad?: () => void;
}

const KROK_PRZEWIJANIA_SEKUND = 15;

function czas(sekundy: number): string {
  const calkowite = Math.max(0, Math.floor(sekundy));
  return `${String(Math.floor(calkowite / 60)).padStart(2, "0")}:${String(calkowite % 60).padStart(2, "0")}`;
}

function Znak({ d, linia = false }: { d: string; linia?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={linia ? style.znakLinia : style.znak}>
      <path d={d} />
    </svg>
  );
}

const ZNAK_ODTWORZ_DUZY = "M6 3l14 9-14 9z";
const ZNAK_ODTWORZ = "M7 4l13 8-13 8z";
const ZNAK_PAUZA = "M6 4h4v16H6zM14 4h4v16h-4z";
const ZNAK_PELNY_EKRAN = "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5";

export function OdtwarzaczNagrania({
  czasTrwaniaSekund,
  pozycjaStartowaSekundy,
  onZmianaOdtwarzania,
  onSekunda,
  onZmianaPozycji,
  onKoniec,
}: WlasciwosciOdtwarzaczaNagrania) {
  const ramka = useRef<HTMLDivElement>(null);
  const malyPrzycisk = useRef<HTMLButtonElement>(null);
  const pozycjaRef = useRef(pozycjaStartowaSekundy);
  const [pozycja, setPozycja] = useState(pozycjaStartowaSekundy);
  const odtwarzaRef = useRef(false);
  const [odtwarza, setOdtwarza] = useState(false);
  const [wznowienie, setWznowienie] = useState(pozycjaStartowaSekundy > 0);
  const [wyciszone, setWyciszone] = useState(false);

  /** Zmiana stanu gry: stan ekranu i jedno zdarzenie na zmianę (nigdy dwa razy to samo). */
  const ustawOdtwarzanie = useCallback(
    (gra: boolean) => {
      if (odtwarzaRef.current === gra) return;
      odtwarzaRef.current = gra;
      setOdtwarza(gra);
      onZmianaOdtwarzania(gra);
    },
    [onZmianaOdtwarzania],
  );
  const zatrzymaj = useCallback(() => ustawOdtwarzanie(false), [ustawOdtwarzanie]);

  useEffect(() => {
    if (!odtwarza) return undefined;
    const id = setInterval(() => {
      // Zatrzymanie w tym samym takcie (np. koniec nagrania) nie dopuszcza kolejnego odczytu zegara.
      if (!odtwarzaRef.current) return;
      const nastepna = Math.min(czasTrwaniaSekund, pozycjaRef.current + 1);
      pozycjaRef.current = nastepna;
      setPozycja(nastepna);
      onSekunda(nastepna);
      if (nastepna >= czasTrwaniaSekund) {
        zatrzymaj();
        onKoniec?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [odtwarza, czasTrwaniaSekund, onSekunda, onKoniec, zatrzymaj]);

  function ustawPozycje(sekundy: number) {
    const ograniczona = Math.max(0, Math.min(czasTrwaniaSekund, Math.round(sekundy)));
    pozycjaRef.current = ograniczona;
    setPozycja(ograniczona);
    setWznowienie(false);
    onZmianaPozycji?.(ograniczona);
  }

  function przelacz() {
    if (odtwarza) {
      zatrzymaj();
      return;
    }
    if (pozycjaRef.current >= czasTrwaniaSekund) ustawPozycje(0);
    setWznowienie(false);
    ustawOdtwarzanie(true);
  }

  function odPoczatku() {
    ustawPozycje(0);
    ustawOdtwarzanie(true);
    malyPrzycisk.current?.focus();
  }

  function przewinMyszka(zdarzenie: MouseEvent<HTMLDivElement>) {
    const prostokat = zdarzenie.currentTarget.getBoundingClientRect();
    if (prostokat.width <= 0) return;
    ustawPozycje(((zdarzenie.clientX - prostokat.left) / prostokat.width) * czasTrwaniaSekund);
  }

  function przewinKlawiatura(zdarzenie: KeyboardEvent<HTMLDivElement>) {
    let cel: number | null = null;
    if (zdarzenie.key === "ArrowRight" || zdarzenie.key === "ArrowUp") cel = pozycjaRef.current + KROK_PRZEWIJANIA_SEKUND;
    else if (zdarzenie.key === "ArrowLeft" || zdarzenie.key === "ArrowDown") cel = pozycjaRef.current - KROK_PRZEWIJANIA_SEKUND;
    else if (zdarzenie.key === "Home") cel = 0;
    else if (zdarzenie.key === "End") cel = czasTrwaniaSekund;
    if (cel === null) return;
    zdarzenie.preventDefault();
    ustawPozycje(cel);
  }

  function pelnyEkran() {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined);
    } else {
      // Przeglądarka może odmówić pełnego ekranu; ramka zostaje wtedy w miejscu.
      void ramka.current?.requestFullscreen?.()?.catch(() => undefined);
    }
  }

  const procent = czasTrwaniaSekund > 0 ? Math.min(100, (pozycja / czasTrwaniaSekund) * 100) : 0;
  const minutaPozycji = numerMinuty(pozycja);
  const minutaOgolem = Math.max(1, Math.round(czasTrwaniaSekund / 60));

  return (
    <div ref={ramka} className={style.ramka} data-pozycja-startowa={pozycjaStartowaSekundy}>
      <div className={style.ekran}>
        <button
          type="button"
          className={`${style.duzy} ${wznowienie ? style.szeroki : ""}`.trim()}
          aria-label={wznowienie ? undefined : odtwarza ? "Zatrzymaj nagranie" : "Odtwórz nagranie"}
          onClick={przelacz}
        >
          <Znak d={odtwarza ? ZNAK_PAUZA : ZNAK_ODTWORZ_DUZY} />
          {wznowienie && <span>{`Odtwórz od ${minutaPozycji}. minuty`}</span>}
        </button>
        {wznowienie && (
          <div className={style.wznowienie}>
            <span>{`Ostatnio zatrzymano w ${minutaPozycji}. minucie.`}</span>
            <button type="button" className={style.drugi} onClick={odPoczatku}>
              Odtwórz od początku
            </button>
          </div>
        )}
      </div>
      <div className={style.sterowanie}>
        <div
          className={style.przewijanie}
          role="slider"
          tabIndex={0}
          aria-label="Miejsce w nagraniu"
          aria-valuemin={0}
          aria-valuemax={czasTrwaniaSekund}
          aria-valuenow={Math.round(pozycja)}
          aria-valuetext={`${minutaPozycji}. minuta z ${minutaOgolem}`}
          onClick={przewinMyszka}
          onKeyDown={przewinKlawiatura}
        >
          <div className={style.tor}>
            <i style={{ width: `${procent}%` }} />
            <b style={{ left: `${procent}%` }} />
          </div>
        </div>
        <div className={style.wiersz}>
          <button
            ref={malyPrzycisk}
            type="button"
            className={style.ikona}
            aria-label={odtwarza ? "Zatrzymaj" : "Odtwórz"}
            onClick={przelacz}
          >
            <Znak d={odtwarza ? ZNAK_PAUZA : ZNAK_ODTWORZ} />
          </button>
          <span className={style.czas}>{`${czas(pozycja)} / ${czas(czasTrwaniaSekund)}`}</span>
          <span className={style.rozpychacz} />
          <button
            type="button"
            className={style.ikona}
            aria-label={wyciszone ? "Włącz dźwięk" : "Wycisz dźwięk"}
            onClick={() => setWyciszone((poprzednio) => !poprzednio)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={style.znakLinia}>
              <path d="M11 5L6 9H2v6h4l5 4z" />
              <path d={wyciszone ? "M22 9l-6 6M16 9l6 6" : "M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"} />
            </svg>
          </button>
          <button type="button" className={style.pelny} onClick={pelnyEkran}>
            <Znak d={ZNAK_PELNY_EKRAN} linia />
            Pełny ekran
          </button>
        </div>
      </div>
    </div>
  );
}
