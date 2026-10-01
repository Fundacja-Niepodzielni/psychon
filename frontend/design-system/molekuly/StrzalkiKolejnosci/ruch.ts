import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Pomocnik ruchu dla list ze strzałkami kolejności. Działa na dowolnej liście
 * wierszy z kluczem: każdy ruchomy element nosi atrybut `data-ruch-klucz` o
 * wartości unikalnej w obrębie kontenera. Pomocnik nie zna tras, danych ani
 * układu strony.
 *
 * Co robi po kliknięciu strzałki (albo po `zapowiedz()` z innego sterowania):
 * 1. zapamiętuje położenie wszystkich kluczowanych elementów PRZED zmianą,
 * 2. po narysowaniu nowej kolejności liczy przesunięcie każdego elementu i
 *    rozgrywa je jako przekształcenie CSS ok. 200 ms (zamiana wierszy płynna,
 *    bez bibliotek),
 * 3. zwraca fokus na tę samą strzałkę przeniesionego wiersza, jeśli wiersz
 *    został przemontowany (np. przejście do innego tematu) i fokus przepadł.
 *
 * Ruch jest lokalny: nie czeka na serwer i nie zmienia chwili zapisu. Zmiana
 * kolejności, której nikt nie zapowiedział (np. powrót wierszy po odmowie
 * zapisu), odbywa się bez ruchu. Przy ustawieniu systemu „ogranicz ruch” zamiana
 * jest natychmiastowa.
 */
export const ATRYBUT_KLUCZA = "data-ruch-klucz";
export const ATRYBUT_STRZALKI = "data-strzalka";
export const CZAS_RUCHU_MS = 200;

export interface Polozenie {
  x: number;
  y: number;
}

export interface Przesuniecie {
  klucz: string;
  dx: number;
  dy: number;
}

/** Zmierzony stan kontenera: położenie i klucz najbliższego kluczowanego przodka. */
export interface Pomiar {
  polozenia: Map<string, Polozenie>;
  rodzice: Map<string, string | null>;
}

const PROG_PIKSELI = 1;

/**
 * Przesunięcia potrzebne, żeby wiersze „przyleciały” z dawnych miejsc na nowe.
 * Pomija elementy bez poprzedniego położenia (nowe), elementy, które się nie
 * ruszyły, i elementy zagnieżdżone, które jadą razem z kluczowanym przodkiem o
 * to samo przesunięcie — inaczej przesunęłyby się dwa razy.
 */
export function obliczPrzesuniecia(przed: Pomiar, po: Pomiar): Przesuniecie[] {
  const wszystkie = new Map<string, Przesuniecie>();
  for (const [klucz, nowe] of po.polozenia) {
    const dawne = przed.polozenia.get(klucz);
    if (!dawne) continue;
    const dx = dawne.x - nowe.x;
    const dy = dawne.y - nowe.y;
    if (Math.abs(dx) < PROG_PIKSELI && Math.abs(dy) < PROG_PIKSELI) continue;
    wszystkie.set(klucz, { klucz, dx, dy });
  }
  const wynik: Przesuniecie[] = [];
  for (const przesuniecie of wszystkie.values()) {
    const rodzic = po.rodzice.get(przesuniecie.klucz);
    const rodzicRuszony = rodzic ? wszystkie.get(rodzic) : undefined;
    if (
      rodzicRuszony &&
      Math.abs(rodzicRuszony.dx - przesuniecie.dx) < PROG_PIKSELI &&
      Math.abs(rodzicRuszony.dy - przesuniecie.dy) < PROG_PIKSELI
    ) {
      continue;
    }
    wynik.push(przesuniecie);
  }
  return wynik;
}

function kluczeElementow(korzen: HTMLElement): HTMLElement[] {
  return Array.from(korzen.querySelectorAll<HTMLElement>(`[${ATRYBUT_KLUCZA}]`));
}

function zmierz(korzen: HTMLElement): Pomiar {
  const polozenia = new Map<string, Polozenie>();
  const rodzice = new Map<string, string | null>();
  for (const element of kluczeElementow(korzen)) {
    const klucz = element.getAttribute(ATRYBUT_KLUCZA);
    if (klucz === null) continue;
    const prostokat = element.getBoundingClientRect();
    polozenia.set(klucz, { x: prostokat.left, y: prostokat.top });
    const przodek = element.parentElement?.closest(`[${ATRYBUT_KLUCZA}]`) ?? null;
    rodzice.set(klucz, przodek ? przodek.getAttribute(ATRYBUT_KLUCZA) : null);
  }
  return { polozenia, rodzice };
}

function ograniczRuch(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

function znajdz(korzen: HTMLElement, klucz: string): HTMLElement | undefined {
  return kluczeElementow(korzen).find((element) => element.getAttribute(ATRYBUT_KLUCZA) === klucz);
}

/** Strzałka, na której ma wrócić fokus po ruchu wiersza. */
export interface CelFokusu {
  klucz: string;
  strzalka: string;
}

interface Zapowiedz {
  pomiar: Pomiar;
  fokus: CelFokusu | null;
}

function rozegraj(korzen: HTMLElement, przesuniecia: Przesuniecie[]) {
  const elementy = przesuniecia
    .map((przesuniecie) => ({ przesuniecie, element: znajdz(korzen, przesuniecie.klucz) }))
    .filter((pozycja): pozycja is { przesuniecie: Przesuniecie; element: HTMLElement } => pozycja.element !== undefined);
  for (const { przesuniecie, element } of elementy) {
    element.style.transition = "none";
    element.style.transform = `translate(${przesuniecie.dx}px, ${przesuniecie.dy}px)`;
  }
  // Wymuszone przeliczenie układu: przeglądarka widzi wiersze na dawnych miejscach.
  void korzen.getBoundingClientRect();
  for (const { element } of elementy) {
    element.style.transition = `transform ${CZAS_RUCHU_MS}ms ease`;
    element.style.transform = "";
    const posprzataj = () => {
      element.style.transition = "";
      element.removeEventListener("transitionend", posprzataj);
    };
    element.addEventListener("transitionend", posprzataj);
    window.setTimeout(posprzataj, CZAS_RUCHU_MS + 100);
  }
}

function zapowiedzWiersza(
  korzen: RefObject<HTMLElement | null>,
  zapowiedzi: { current: Zapowiedz | null },
  fokus: CelFokusu | null,
) {
  const element = korzen.current;
  if (!element) return;
  const biezaca: Zapowiedz = { pomiar: zmierz(element), fokus };
  zapowiedzi.current = biezaca;
  // Zapowiedź żyje do pierwszego rysowania po kliknięciu. Gdy nic się nie
  // zmieniło (brak rysowania), wygasa, żeby nie ruszyć późniejszej zmiany.
  window.setTimeout(() => {
    if (zapowiedzi.current === biezaca) zapowiedzi.current = null;
  }, 0);
}

export interface RuchWierszy {
  /**
   * Zapowiedź ruchu z innego sterowania niż strzałki (np. pozycja menu): przed
   * zmianą kolejności zapamiętuje położenia, po zmianie rozgrywa ruch. Bez
   * `fokus` pomocnik nie rusza fokusu — odpowiada za niego wywołujący.
   */
  zapowiedz: (fokus?: CelFokusu | null) => void;
}

/**
 * `korzen` to ref kontenera listy — ten sam, który wywołujący podaje elementowi
 * (`ref={korzen}`); w nim stoją kluczowane wiersze.
 */
export function useRuchWierszy(korzen: RefObject<HTMLElement | null>): RuchWierszy {
  const zapowiedzi = useRef<Zapowiedz | null>(null);

  function zapowiedz(fokus: CelFokusu | null = null) {
    zapowiedzWiersza(korzen, zapowiedzi, fokus);
  }

  // Kliknięcie strzałki jest przechwytywane na kontenerze zdarzeniem
  // natywnym: pomiar „przed” musi zdążyć przed obsługą kliknięcia, która
  // zmienia kolejność. Kontener nie dostaje przez to żadnej obsługi w JSX.
  useEffect(() => {
    const element = korzen.current;
    if (!element) return;
    function przechwyc(zdarzenie: MouseEvent) {
      const cel = zdarzenie.target instanceof Element ? zdarzenie.target : null;
      const przycisk = cel?.closest<HTMLElement>(`[${ATRYBUT_STRZALKI}]`);
      if (!przycisk || przycisk.getAttribute("aria-disabled") === "true") return;
      const wiersz = przycisk.closest<HTMLElement>(`[${ATRYBUT_KLUCZA}]`);
      const klucz = wiersz?.getAttribute(ATRYBUT_KLUCZA);
      const strzalka = przycisk.getAttribute(ATRYBUT_STRZALKI);
      if (!klucz || !strzalka) return;
      zapowiedzWiersza(korzen, zapowiedzi, { klucz, strzalka });
    }
    element.addEventListener("click", przechwyc, true);
    return () => element.removeEventListener("click", przechwyc, true);
  }, [korzen]);

  // Bez tablicy zależności: zapowiedź może zostać zrealizowana przy każdym rysowaniu.
  useLayoutEffect(() => {
    const biezaca = zapowiedzi.current;
    const element = korzen.current;
    if (!biezaca || !element) return;
    zapowiedzi.current = null;

    if (!ograniczRuch()) {
      const przesuniecia = obliczPrzesuniecia(biezaca.pomiar, zmierz(element));
      if (przesuniecia.length > 0) rozegraj(element, przesuniecia);
    }

    if (biezaca.fokus) {
      const aktywny = document.activeElement;
      const fokusPrzepadl = aktywny === null || aktywny === document.body || !aktywny.isConnected;
      if (fokusPrzepadl) {
        const wiersz = znajdz(element, biezaca.fokus.klucz);
        wiersz?.querySelector<HTMLElement>(`[${ATRYBUT_STRZALKI}="${biezaca.fokus.strzalka}"]`)?.focus();
      }
    }
  });

  return { zapowiedz };
}
