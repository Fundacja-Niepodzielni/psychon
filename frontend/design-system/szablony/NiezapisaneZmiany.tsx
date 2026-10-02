"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { Text } from "../atomy/Text/Text";
import { Dialog } from "../organizmy/Dialog/Dialog";

/**
 * Pytanie przed wyjściem z ekranu — jeden mechanizm wspólnej ramy panelu.
 *
 * Ekran ZGŁASZA ramie powód pytania (`useZgloszenieNiezapisanychZmian`):
 * „mam niezapisane zmiany”. Zgłoszenie znika przy odmontowaniu ekranu i wtedy,
 * gdy ekran przestaje mieć zmiany (po zapisie). Rama pyta JEDNYM oknem
 * (`OknoPytaniaOWyjscie`, organizm `Dialog`) przed każdym wyjściem, które przez
 * nią przechodzi: pozycja menu, odnośnik w treści, okruszek, przycisk ekranu
 * wołający `useNawigacjaZPytaniem`, wylogowanie. Zamknięcie i przeładowanie
 * karty przeglądarki obsługuje jedna obsługa `beforeunload` — zakładana przy
 * pierwszym zgłoszeniu i zdejmowana razem z ostatnim.
 *
 * Mechanizm niczego nie zapisuje, nie zmienia treści żądań i nie trzyma danych
 * formularza: wie tylko, że powód jest, jakiego jest rodzaju i — opcjonalnie —
 * jak nazywa się ekran.
 *
 * Rodzaj powodu (`RodzajPowoduPytania`) jest słownikiem: kolejny powód
 * (np. trwające wysyłanie pliku) dochodzi jako nowa wartość z własnymi
 * zdaniami w `ZDANIA_POWODU`, bez zmiany kształtu zgłoszenia.
 *
 * Granice: bez ramy (ekran poza `PowlokaPanelu`) nie ma okna, więc wyjścia nie
 * są wstrzymywane — zostaje pytanie przeglądarki przy zamknięciu karty.
 * Przycisk „wstecz” przeglądarki nie przechodzi przez ramę i router nie daje
 * sposobu, żeby go wstrzymać; to wyjście nie pyta.
 */

/** Rodzaj powodu pytania — słownik zamknięty. */
export type RodzajPowoduPytania = "niezapisane-zmiany";

export interface PowodPytania {
  rodzaj: RodzajPowoduPytania;
  /** Nazwa ekranu, który zgłasza powód (do diagnostyki; okno jej nie pokazuje). */
  ekran?: string;
  /**
   * Kto pyta przy odnośnikach w treści ekranu: `rama` (domyślnie) albo `ekran`,
   * gdy ekran ma własne pytanie dla swoich odnośników.
   */
  odnosnikiTresci?: "rama" | "ekran";
}

interface ZdaniaOkna {
  tytul: string;
  tresc: string;
  zostan: string;
  wyjdz: string;
}

const ZDANIA_POWODU: Record<RodzajPowoduPytania, ZdaniaOkna> = {
  "niezapisane-zmiany": {
    tytul: "Masz niezapisane zmiany",
    tresc: "Jeśli wyjdziesz, zmiany zostaną utracone.",
    zostan: "Zostań",
    wyjdz: "Wyjdź bez zapisywania",
  },
};

interface Pytanie {
  rodzaj: RodzajPowoduPytania;
  dalej: () => void;
  /** Element, który wywołał wyjście — po „Zostań” fokus wraca na niego. */
  wywolujacy: HTMLElement | null;
}

const powody = new Map<symbol, PowodPytania>();
const sluchacze = new Set<() => void>();
let pytanie: Pytanie | null = null;
let doFokusu: HTMLElement | null = null;
let liczbaOkien = 0;

function oglos() {
  for (const sluchacz of Array.from(sluchacze)) sluchacz();
}

function naZamkniecieKarty(zdarzenie: BeforeUnloadEvent) {
  zdarzenie.preventDefault();
}

/** Jedna obsługa zamknięcia karty: stoi dokładnie wtedy, gdy jest co najmniej jeden powód. */
function uzgodnijZamkniecieKarty() {
  if (typeof window === "undefined") return;
  window.removeEventListener("beforeunload", naZamkniecieKarty);
  if (powody.size > 0) window.addEventListener("beforeunload", naZamkniecieKarty);
}

/** Zgłasza powód pytania; zwraca funkcję, która zgłoszenie zdejmuje. */
export function zglosPowodPytania(powod: PowodPytania): () => void {
  const klucz = Symbol(powod.ekran ?? powod.rodzaj);
  powody.set(klucz, powod);
  uzgodnijZamkniecieKarty();
  return () => {
    if (!powody.delete(klucz)) return;
    uzgodnijZamkniecieKarty();
  };
}

/** Czy którykolwiek ekran zgłasza powód pytania. */
export function saPowodyPytania(): boolean {
  return powody.size > 0;
}

/** Czy każdy zgłaszający ekran sam pyta przy odnośnikach swojej treści. */
export function ekranPytaWTresci(): boolean {
  return powody.size > 0 && Array.from(powody.values()).every((powod) => powod.odnosnikiTresci === "ekran");
}

/**
 * Wyjście przez ramę. Bez powodu (albo bez okna ramy) `dalej` rusza od razu,
 * w tym samym wywołaniu. Z powodem — rama pyta; `dalej` rusza po „Wyjdź bez
 * zapisywania”, a po „Zostań” nie rusza wcale.
 */
export function zapytajPrzedWyjsciem(dalej: () => void, wywolujacy?: HTMLElement | null): void {
  if (powody.size === 0 || liczbaOkien === 0) {
    dalej();
    return;
  }
  if (pytanie !== null) return;
  const aktywny = typeof document === "undefined" ? null : document.activeElement;
  pytanie = {
    rodzaj: Array.from(powody.values())[0].rodzaj,
    dalej,
    wywolujacy: wywolujacy ?? (aktywny instanceof HTMLElement ? aktywny : null),
  };
  oglos();
}

function zostan() {
  if (pytanie === null) return;
  doFokusu = pytanie.wywolujacy;
  pytanie = null;
  oglos();
}

function wyjdz() {
  if (pytanie === null) return;
  const { dalej } = pytanie;
  pytanie = null;
  // Osoba zdecydowała: zgłoszenia znikają, więc to wyjście nie pyta drugi raz
  // (także przeglądarka przy pełnym przejściu dokumentu).
  powody.clear();
  uzgodnijZamkniecieKarty();
  oglos();
  dalej();
}

function zapisz(sluchacz: () => void) {
  sluchacze.add(sluchacz);
  return () => {
    sluchacze.delete(sluchacz);
  };
}

/**
 * Ekran zgłasza ramie niezapisane zmiany. `aktywne` to odpowiedź ekranu na
 * pytanie „czy jest co stracić” — liczona z jego własnego stanu.
 */
export function useZgloszenieNiezapisanychZmian(
  aktywne: boolean,
  ekran?: string,
  odnosnikiTresci: "rama" | "ekran" = "rama",
): void {
  useEffect(() => {
    if (!aktywne) return;
    return zglosPowodPytania({ rodzaj: "niezapisane-zmiany", ekran, odnosnikiTresci });
  }, [aktywne, ekran, odnosnikiTresci]);
}

export interface NawigacjaZPytaniem {
  /** Przejście pod adres aplikacji (po stronie klienta) — przez pytanie ramy. */
  przejdz: (href: string, wywolujacy?: HTMLElement | null) => void;
  /** Powrót do poprzedniego ekranu (przycisk ekranu, nie przeglądarki) — przez pytanie ramy. */
  wstecz: (wywolujacy?: HTMLElement | null) => void;
}

/** Jedna nawigacja dla powłok i ekranów: każde wyjście idzie przez pytanie ramy. */
export function useNawigacjaZPytaniem(): NawigacjaZPytaniem {
  const router = useRouter();
  return useMemo(
    () => ({
      przejdz: (href, wywolujacy) => zapytajPrzedWyjsciem(() => router.push(href), wywolujacy),
      wstecz: (wywolujacy) => zapytajPrzedWyjsciem(() => router.back(), wywolujacy),
    }),
    [router],
  );
}

/**
 * Okno pytania — rysuje je rama (`PowlokaPanelu`), raz. Tytuł, rola i pułapka
 * fokusu pochodzą z organizmu `Dialog`; fokus startuje na „Zostań”. Po
 * „Zostań” fokus wraca na element, który wywołał wyjście (o ile nadal jest
 * w dokumencie — odnośnik z zamkniętego menu już nie istnieje).
 */
export function OknoPytaniaOWyjscie() {
  const biezace = useSyncExternalStore(
    zapisz,
    () => pytanie,
    () => null,
  );

  useEffect(() => {
    liczbaOkien += 1;
    return () => {
      liczbaOkien -= 1;
      // Rama znika razem z oknem: otwarte pytanie nie ma gdzie zostać.
      if (liczbaOkien === 0) pytanie = null;
    };
  }, []);

  // Po zamknięciu okna: `Dialog` oddał fokus elementowi sprzed otwarcia, a ostatnie
  // słowo ma element, który wywołał wyjście.
  useEffect(() => {
    if (biezace !== null || doFokusu === null) return;
    const cel = doFokusu;
    doFokusu = null;
    if (cel.isConnected) cel.focus();
  }, [biezace]);

  if (biezace === null) return null;
  const zdania = ZDANIA_POWODU[biezace.rodzaj];
  return (
    <Dialog
      tytul={zdania.tytul}
      etykietaWycofania={zdania.zostan}
      etykietaPotwierdzenia={zdania.wyjdz}
      onWycofaj={zostan}
      onPotwierdz={wyjdz}
    >
      <Text>{zdania.tresc}</Text>
    </Dialog>
  );
}
