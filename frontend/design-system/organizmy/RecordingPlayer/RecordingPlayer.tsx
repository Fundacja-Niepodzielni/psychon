"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { adresRamkiOdtwarzacza, POCHODZENIE_ODTWARZACZA } from "../../../lib/konfiguracja/odtwarzacz-nagran";
import { utworzLicznikCzasu } from "./licznikCzasu";
import {
  odczytajKomunikat,
  poleceniePozycji,
  polecenieSubskrypcji,
  pozycjaStartu,
  ZDARZENIA_SUBSKRYBOWANE,
} from "./protokol";
import style from "./RecordingPlayer.module.css";

/** Ile czekamy na zgłoszenie gotowości ramki, zanim zgłosimy błąd w górę. */
export const CZAS_NA_GOTOWOSC_MS = 15_000;

/**
 * `sandbox` — najmniejszy zestaw, przy którym odtwarzacz w ramce działa:
 * - `allow-scripts`: odtwarzacz jest skryptem; bez tego ramka nie odtwarza
 *   i nie wysyła żadnego komunikatu;
 * - `allow-same-origin`: ramka zachowuje WŁASNE pochodzenie (obce wobec
 *   strony, więc nie daje jej dostępu do aplikacji). Bez tego jej pochodzenie
 *   jest nieprzejrzyste, komunikaty przychodzą z `origin` równym "null"
 *   i sprawdzenie pochodzenia odrzuciłoby każdy.
 * Świadomie brak: formularzy, wyskakujących okien, nawigacji okna nadrzędnego,
 * pobierania, okien modalnych i blokady wskaźnika.
 */
export const SANDBOX_RAMKI = "allow-scripts allow-same-origin";

/**
 * `allow` — najmniejsza lista uprawnień:
 * - `fullscreen`: przycisk pełnego ekranu w odtwarzaczu;
 * - `encrypted-media`: odtwarzanie nagrania chronionego przed kopiowaniem.
 * Świadomie brak `autoplay`: strona nigdy nie uruchamia odtwarzania z zewnątrz,
 * zaczyna je osoba przyciskiem w ramce.
 */
export const ALLOW_RAMKI = "fullscreen; encrypted-media";

/**
 * `referrerpolicy` — ramka dostaje samo pochodzenie aplikacji, bez ścieżki
 * (identyfikatora lekcji) i bez zapytania. Podpis adresu ramki nie zależy od
 * odsyłacza; samo pochodzenie wystarcza dostawcy, gdy ogranicza osadzanie do
 * listy domen, a `no-referrer` takie ograniczenie by złamało.
 */
export const REFERRER_RAMKI = "strict-origin";

/**
 * `loading` — ramka wczytuje się od razu: jest główną treścią ekranu, a czas
 * na gotowość liczymy od osadzenia (leniwe wczytywanie poza widokiem
 * zgłaszałoby fałszywy błąd).
 */
export const LOADING_RAMKI = "eager";

export type PowodBleduNagrania =
  /** Adres ramki nie wskazuje dozwolonego pochodzenia odtwarzacza — ramka nie powstaje. */
  | "adres-niedozwolony"
  /** Ramka nie zgłosiła gotowości w czasie `CZAS_NA_GOTOWOSC_MS`. */
  | "brak-gotowosci"
  /** Przeglądarka zgłosiła błąd wczytania ramki. */
  | "ramka"
  /** Odtwarzacz w ramce zgłosił błąd odtwarzania. */
  | "odtwarzanie";

export interface PostepNagrania {
  /** Pozycja odtwarzania zgłoszona przez ramkę, w sekundach. */
  pozycjaSekund: number;
  /** Pełne sekundy odtwarzania doliczone od poprzedniego zgłoszenia. */
  przyrostObejrzane: number;
  /** Jak wyżej, ale tylko przy widocznej karcie. */
  przyrostAktywne: number;
}

export interface WlasciwosciRecordingPlayer {
  /** Tytuł lekcji — trafia do `title` ramki. */
  tytul: string;
  /** Podpisany adres ramki z odczytu linku nagrania. */
  adresRamki: string;
  /** Chwila wygaśnięcia adresu ramki (ISO 8601) albo brak, gdy nieznana. */
  adresWygasa?: string | null;
  /** Pozycja, od której ma ruszyć odtwarzanie. */
  pozycjaStartowaSekund?: number | null;
  /** Długość nagrania w sekundach. */
  czasTrwaniaSekund: number;
  /** Przyrosty czasu i pozycja — wyłącznie z komunikatów ramki. */
  onPostep: (postep: PostepNagrania) => void;
  /** Ramka zgłosiła start (`true`) albo pauzę, koniec lub błąd (`false`). */
  onZmianaOdtwarzania?: (odtwarzane: boolean) => void;
  /** Nagranie odtworzone do końca. */
  onKoniec?: () => void;
  /** Ramka zgłosiła gotowość (także spóźnioną, po zgłoszonym braku gotowości). */
  onGotowa?: () => void;
  /** Nagranie nie działa. */
  onBlad: (powod: PowodBleduNagrania) => void;
  /** Adres ramki wygasł: ekran ma odczytać nowy i podać go w `adresRamki`. */
  onOdswiezAdres: () => void;
}

type Faza = "ladowanie" | "gotowa" | "blad" | "czeka";

/** Nagranie wskazywane przez adres, bez podpisu: ten sam klucz = odświeżony adres tego samego nagrania. */
function kluczNagrania(adres: string): string {
  const url = adresRamkiOdtwarzacza(adres);
  return url === null ? adres : `${url.origin}${url.pathname}`;
}

function czyWygasl(wygasa: string | null | undefined): boolean {
  if (typeof wygasa !== "string") return false;
  const chwila = Date.parse(wygasa);
  return Number.isFinite(chwila) && chwila <= Date.now();
}

/**
 * Odtwarzacz nagrania lekcji w ramce dostawcy. Organizm sam nie wysyła żadnych
 * żądań do zaplecza: dostaje podpisany adres ramki i zgłasza w górę postęp,
 * koniec, błąd i prośbę o nowy adres.
 *
 * Komunikaty ramki są przyjmowane WYŁĄCZNIE, gdy `event.origin` jest dozwolonym
 * pochodzeniem odtwarzacza ORAZ `event.source` jest oknem tej ramki. Do ramki
 * wysyłamy zawsze z dokładnym pochodzeniem docelowym, nigdy `*`.
 *
 * Czas rośnie tylko z komunikatów odtwarzania (`licznikCzasu.ts`); organizm nie
 * ma własnego zegara odtwarzania.
 *
 * Wygaśnięcie adresu: prośba o nowy idzie w górę raz na adres. Ramka, która już
 * działa, nie jest przeładowywana (odtwarzanie nie jest przerywane); nowy adres
 * tego samego nagrania jest używany dopiero, gdy ramka go potrzebuje — przy
 * błędzie odtwarzania albo gdy ramka nie zdążyła zgłosić gotowości. Po wymianie
 * odtwarzanie rusza od ostatniej pozycji zgłoszonej przez ramkę.
 */
export function RecordingPlayer({
  tytul,
  adresRamki,
  adresWygasa,
  pozycjaStartowaSekund,
  czasTrwaniaSekund,
  onPostep,
  onZmianaOdtwarzania,
  onKoniec,
  onGotowa,
  onBlad,
  onOdswiezAdres,
}: WlasciwosciRecordingPlayer) {
  const ramka = useRef<HTMLIFrameElement>(null);
  const ostatniaPozycja = useRef<number | null>(null);
  const [wygaslyAdres, setWygaslyAdres] = useState<string | null>(() =>
    czyWygasl(adresWygasa) ? adresRamki : null,
  );
  const [osadzony, setOsadzony] = useState<string | null>(null);
  const [faza, setFaza] = useState<Faza>("ladowanie");

  const dozwolony = adresRamkiOdtwarzacza(adresRamki) !== null;
  const kandydat = dozwolony && wygaslyAdres !== adresRamki ? adresRamki : null;

  // Przyjęcie adresu z właściwości. Działająca ramka tego samego nagrania
  // zostaje: odświeżony podpis nie przerywa odtwarzania.
  if (kandydat !== null && kandydat !== osadzony) {
    const toSamoNagranie = osadzony !== null && kluczNagrania(osadzony) === kluczNagrania(kandydat);
    if (!(toSamoNagranie && faza === "gotowa")) {
      setOsadzony(kandydat);
      setFaza("ladowanie");
    }
  }

  const zglosPostep = useEffectEvent((postep: PostepNagrania) => onPostep(postep));
  const zglosZmiane = useEffectEvent((odtwarzane: boolean) => onZmianaOdtwarzania?.(odtwarzane));
  const zglosKoniec = useEffectEvent(() => onKoniec?.());
  const zglosGotowosc = useEffectEvent(() => onGotowa?.());
  const zglosBlad = useEffectEvent((powod: PowodBleduNagrania) => onBlad(powod));
  const poprosONowyAdres = useEffectEvent(() => onOdswiezAdres());
  const start = useEffectEvent(() =>
    pozycjaStartu(ostatniaPozycja.current ?? pozycjaStartowaSekund, czasTrwaniaSekund),
  );
  /** Ramka zawiodła: najpierw nowy adres (gdy już jest albo gdy stary wygasł), dopiero potem błąd. */
  const awaria = useEffectEvent((powod: PowodBleduNagrania) => {
    if (kandydat !== null && kandydat !== osadzony) {
      setOsadzony(kandydat);
      setFaza("ladowanie");
      return;
    }
    if (osadzony !== null && wygaslyAdres === osadzony) {
      // Prośba o nowy adres poszła w chwili wygaśnięcia; czekamy na niego bez ramki.
      setFaza("czeka");
      return;
    }
    setFaza("blad");
    zglosBlad(powod);
  });

  useEffect(() => {
    if (!dozwolony) zglosBlad("adres-niedozwolony");
  }, [adresRamki, dozwolony]);

  useEffect(() => {
    if (!dozwolony || typeof adresWygasa !== "string") return undefined;
    const chwila = Date.parse(adresWygasa);
    if (!Number.isFinite(chwila)) return undefined;
    const zaIle = Math.max(0, chwila - Date.now());
    // Granica `setTimeout`: dłuższe opóźnienie odpaliłoby od razu.
    if (zaIle > 2_147_483_647) return undefined;
    const zegar = setTimeout(() => {
      setWygaslyAdres(adresRamki);
      poprosONowyAdres();
    }, zaIle);
    return () => clearTimeout(zegar);
  }, [adresRamki, adresWygasa, dozwolony]);

  useEffect(() => {
    const element = ramka.current;
    if (osadzony === null || element === null) return undefined;
    const licznik = utworzLicznikCzasu();
    let gotowa = false;

    function wyslij(komunikat: string) {
      // Zawsze dokładne pochodzenie docelowe: komunikat trafia wyłącznie do odtwarzacza.
      element?.contentWindow?.postMessage(komunikat, POCHODZENIE_ODTWARZACZA);
    }

    const zegarGotowosci = setTimeout(() => {
      if (!gotowa) awaria("brak-gotowosci");
    }, CZAS_NA_GOTOWOSC_MS);

    function naKomunikat(zdarzenie: MessageEvent) {
      if (zdarzenie.origin !== POCHODZENIE_ODTWARZACZA) return;
      if (zdarzenie.source === null || zdarzenie.source !== element?.contentWindow) return;
      const komunikat = odczytajKomunikat(zdarzenie.data);
      if (komunikat === null) return;

      if (komunikat.zdarzenie === "ready") {
        if (gotowa) return;
        gotowa = true;
        clearTimeout(zegarGotowosci);
        setFaza("gotowa");
        for (const nazwa of ZDARZENIA_SUBSKRYBOWANE) wyslij(polecenieSubskrypcji(nazwa));
        const pozycja = start();
        if (pozycja !== null) wyslij(poleceniePozycji(pozycja));
        zglosGotowosc();
        return;
      }
      if (!gotowa) return;

      switch (komunikat.zdarzenie) {
        case "play":
          licznik.odtwarzanie();
          zglosZmiane(true);
          break;
        case "pause":
        case "ended": {
          const odtwarzal = licznik.czyOdtwarza();
          licznik.zatrzymanie();
          if (odtwarzal) zglosZmiane(false);
          if (komunikat.zdarzenie === "ended") zglosKoniec();
          break;
        }
        case "seeked":
          licznik.przewiniecie();
          break;
        case "timeupdate": {
          const pozycja = komunikat.pozycjaSekund;
          if (pozycja === null) break;
          const przyrost = licznik.pozycja(pozycja, performance.now(), !document.hidden);
          if (licznik.czyOdtwarza()) ostatniaPozycja.current = pozycja;
          if (przyrost.obejrzane > 0 || przyrost.aktywne > 0) {
            zglosPostep({
              pozycjaSekund: pozycja,
              przyrostObejrzane: przyrost.obejrzane,
              przyrostAktywne: przyrost.aktywne,
            });
          }
          break;
        }
        case "error": {
          const odtwarzal = licznik.czyOdtwarza();
          licznik.zatrzymanie();
          if (odtwarzal) zglosZmiane(false);
          awaria("odtwarzanie");
          break;
        }
      }
    }

    // Ramka mogła zgłosić gotowość, zanim zaczęliśmy słuchać: po wczytaniu
    // prosimy o nią jeszcze raz (protokół odpowiada wtedy zdarzeniem gotowości).
    function poWczytaniu() {
      if (!gotowa) wyslij(polecenieSubskrypcji("ready"));
    }
    function poBledzieRamki() {
      if (!gotowa) awaria("ramka");
    }

    window.addEventListener("message", naKomunikat);
    element.addEventListener("load", poWczytaniu);
    element.addEventListener("error", poBledzieRamki);
    return () => {
      clearTimeout(zegarGotowosci);
      window.removeEventListener("message", naKomunikat);
      element.removeEventListener("load", poWczytaniu);
      element.removeEventListener("error", poBledzieRamki);
      if (licznik.czyOdtwarza()) zglosZmiane(false);
    };
  }, [osadzony]);

  if (!dozwolony) return null;

  const zRamka = osadzony !== null && faza !== "czeka";
  const wczytywanie = faza === "ladowanie" || faza === "czeka" || osadzony === null;

  return (
    <div className={style.rama}>
      {zRamka && (
        <iframe
          key={osadzony}
          ref={ramka}
          className={style.ramka}
          src={osadzony}
          title={`Nagranie lekcji: ${tytul}`}
          sandbox={SANDBOX_RAMKI}
          allow={ALLOW_RAMKI}
          referrerPolicy={REFERRER_RAMKI}
          loading={LOADING_RAMKI}
        />
      )}
      {wczytywanie && (
        <p className={style.stan} role="status">
          Wczytywanie nagrania…
        </p>
      )}
    </div>
  );
}
