"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { Heading } from "../../atomy/Heading/Heading";
import { Link } from "../../atomy/Link/Link";
import { Text } from "../../atomy/Text/Text";
import { DialogActions } from "../../molekuly/DialogActions/DialogActions";
import { zapewnijObszarOgloszen } from "./obszarOgloszen";
import { czyNaWierzchu, dodajOkno } from "./stosOkien";
import style from "./Dialog.module.css";

export { oglosWPanelu } from "./obszarOgloszen";

/** Jeden błąd w podsumowaniu okna formularza: zdanie i — gdy dotyczy pola — `id` tego pola. */
export interface BladDialogu {
  tresc: string;
  idPola?: string;
}

/**
 * Element, na który wraca fokus po zamknięciu, gdy przycisk wołający już nie
 * istnieje albo jest niedostępny: `id` elementu albo funkcja go zwracająca.
 */
export type CelFokusuPoZamknieciu = string | (() => HTMLElement | null);

interface WlasciwosciDialog {
  tytul: string;
  /** Treść okna — `Text` albo `Field`, przekazane przez wywołującego. */
  children: ReactNode;
  etykietaWycofania: string;
  etykietaPotwierdzenia: string;
  onWycofaj: () => void;
  /**
   * Potwierdzenie. W wariancie `formularz` woła je wysłanie formularza
   * (przycisk główny albo Enter w polu); obietnica w odpowiedzi trzyma okno
   * w stanie zapisu do jej rozstrzygnięcia.
   */
  onPotwierdz: () => void | Promise<unknown>;
  /** Potwierdzenie destrukcyjne — przekazywane wprost do `DialogActions`. */
  niebezpieczne?: boolean;
  /**
   * `potwierdzenie` (domyślnie) — pytanie „Na pewno?” jak dotąd.
   * `formularz` — treść w `<form>`: fokus na pierwszym polu, Enter wysyła,
   * przesłona nie zamyka, Escape przy wpisanych danych pyta o porzucenie.
   */
  wariant?: "potwierdzenie" | "formularz";
  /**
   * Krótki opis okna formularza nad polami, powiązany przez
   * `aria-describedby`. W wariancie `potwierdzenie` opisem jest cała treść.
   */
  opis?: ReactNode;
  /** Błędy formularza: podsumowanie na górze okna, które dostaje fokus; pozycja z `idPola` prowadzi do pola. */
  bledy?: readonly BladDialogu[];
  tytulBledow?: string;
  /** Zapis trwa (sterowany z zewnątrz) — działa tak samo jak obietnica z `onPotwierdz`. */
  zapisywanie?: boolean;
  etykietaZapisywania?: string;
  /**
   * Czy w formularzu są wpisane dane, których zamknięcie by nie zapisało.
   * Bez tej właściwości okno uznaje dane za wpisane po pierwszej zmianie
   * dowolnego pola formularza.
   */
  niezapisaneZmiany?: boolean;
  /** Gdzie wraca fokus, gdy przycisk wołający po zamknięciu już nie istnieje (np. nagłówek sekcji). */
  fokusPoZamknieciu?: CelFokusuPoZamknieciu;
}

/**
 * Okno `Dialog`. `Heading` + treść (`Text`/`Field`) + `DialogActions`, w
 * natywnym elemencie `<dialog>` otwieranym przez `showModal()`: przeglądarka
 * sama wyłącza resztę strony (inert) i rysuje przesłonę; okno blokuje do
 * tego przewijanie strony pod spodem. Środowisko bez `showModal` (np. jsdom)
 * dostaje atrybut `open` i ten sam układ.
 *
 * Układ: nagłówek u góry, przyciski u dołu, przewija się wyłącznie środek.
 * Poniżej 600 px okno wypełnia ekran; szersze ekrany dostają okno
 * o ograniczonej wysokości. Gdy klawiatura telefonu zmniejsza widoczną
 * część strony, okno dopasowuje się do niej, a pole z fokusem jest
 * dosuwane do widoku.
 *
 * Wariant `potwierdzenie` (domyślny, wszystkie dotychczasowe użycia):
 * wyjście (Escape) i klik w przesłonę wołają `onWycofaj` — ten sam skutek co
 * przycisk wycofania. Enter zatwierdza (`onPotwierdz`) WYŁĄCZNIE gdy jego
 * celem jest pole tekstowe (`input` o typie innym niż checkbox/radio/
 * przycisk) — nigdy z przycisku (w tym wycofania) ani z kontrolki wyboru
 * (`role="combobox"`), żeby Enter naciśnięty na fokusie „Anuluj” nie
 * zatwierdzał okna zamiast je zamykać. Pole wieloliniowe (`Textarea`) nie
 * jest `input`, więc Enter w nim wstawia nową linię. Fokus startuje na
 * wycofaniu (`DialogActions`).
 *
 * Wariant `formularz`: treść i przyciski stoją w `<form>`, więc Enter w polu
 * wysyła formularz jak na stronie. Fokus startuje na pierwszym polu. Okno
 * zostaje otwarte do odpowiedzi serwera: w czasie zapisu przycisk główny
 * mówi „Zapisywanie…”, jest niedostępny, a kolejne wysłanie jest
 * ignorowane, zanim cokolwiek wyjdzie. Błędy stoją na górze okna jako
 * podsumowanie, które dostaje fokus; każdy błąd pola prowadzi do pola.
 * Klik w przesłonę nigdy nie zamyka formularza. Escape przy wpisanych
 * danych pyta w tym samym oknie „Porzucić wpisane dane?” („Porzuć” /
 * „Wróć do formularza”). Przycisk „Wstecz” przeglądarki (także na
 * telefonie) zamyka samo okno — okno dokłada jeden wpis historii i zdejmuje
 * go przy zamknięciu; przy wpisanych danych pyta tak samo jak Escape.
 *
 * Dwa okna naraz nie są obsługiwane: klawisze dostaje wyłącznie okno na
 * wierzchu (`stosOkien.ts`), a otwarcie drugiego okna ostrzega w konsoli
 * w trybie deweloperskim.
 *
 * Fokus po zamknięciu wraca do elementu aktywnego PRZED zamontowaniem okna
 * (przycisk wołający); gdy ten element zniknął albo jest niedostępny, fokus
 * idzie na `fokusPoZamknieciu` (np. nagłówek sekcji). Komunikat o sukcesie
 * wywołujący ogłasza przez `oglosWPanelu` — w stałym obszarze ogłoszeń,
 * który okno zakłada przy otwarciu, a nie w elemencie tworzonym razem
 * z treścią.
 *
 * Pułapka fokusu: `Tab`/`Shift+Tab` krążą WYŁĄCZNIE po elementach
 * fokusowalnych wewnątrz okna — z ostatniego elementu `Tab` wraca na
 * pierwszy, z pierwszego `Shift+Tab` przechodzi na ostatni, fokus spoza
 * okna wraca na pierwszy element.
 *
 * Ograniczenie jawne: „wejście na inny ekran zamyka wszystkie” (nawigacja
 * usuwa WSZYSTKIE otwarte okna) jest regułą routingu aplikacji — ten plik nie
 * zna trasy, więc nie może tego wymusić sam. Właściciel: warstwa routingu
 * wywołującej strony. Wywołujący okno formularza nie przechodzi na inny
 * adres w tej samej chwili, w której zamyka okno — zdjęcie wpisu historii
 * jest asynchroniczne.
 */
const SELEKTOR_FOKUSOWALNYCH =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [role="combobox"], [tabindex]:not([tabindex="-1"])';
const SELEKTOR_POL =
  'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [role="combobox"]:not([disabled])';

/** Klucz wpisu historii dokładanego przez okno formularza. */
export const KLUCZ_WPISU_HISTORII = "oknoFormularza";

type ZrodloZamkniecia = "escape" | "wstecz" | "przegladarka";

interface WpisHistorii {
  znacznik: string;
  dodany: boolean;
}

/** Dokłada wpis historii okna (ze stanem routera skopiowanym z bieżącego wpisu). */
function dodajWpisHistorii(historia: { current: WpisHistorii | null }) {
  if (typeof window === "undefined") return;
  const wpis = historia.current ?? { znacznik: `okno-${Math.random().toString(36).slice(2)}`, dodany: false };
  historia.current = wpis;
  const stan = (window.history.state as Record<string, unknown> | null) ?? {};
  window.history.pushState({ ...stan, [KLUCZ_WPISU_HISTORII]: wpis.znacznik }, "");
  wpis.dodany = true;
}

function widoczny(element: HTMLElement): boolean {
  return element.closest("[hidden]") === null;
}

function dostepnyDoFokusu(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement) || !element.isConnected) return false;
  if (element === element.ownerDocument.body) return false;
  if ((element as HTMLButtonElement).disabled) return false;
  return widoczny(element);
}

export function Dialog({
  tytul,
  children,
  etykietaWycofania,
  etykietaPotwierdzenia,
  onWycofaj,
  onPotwierdz,
  niebezpieczne = false,
  wariant = "potwierdzenie",
  opis,
  bledy,
  tytulBledow = "Popraw dane w formularzu",
  zapisywanie: zapisywanieZZewnatrz = false,
  etykietaZapisywania = "Zapisywanie…",
  niezapisaneZmiany,
  fokusPoZamknieciu,
}: WlasciwosciDialog) {
  const formularz = wariant === "formularz";
  const idNaglowka = useId();
  const idOpisu = useId();
  const idTytuluBledow = useId();
  const idPytania = useId();
  const [znacznik] = useState(() => Symbol("okno"));
  // Przechwycone w LENIWYM INICJALIZATORZE `useState`, nie w efekcie:
  // `DialogActions` (dziecko) ma WŁASNY efekt, który przenosi fokus na
  // przycisk wycofania zaraz po zamontowaniu — efekty dziecka odpalają się
  // PRZED efektem rodzica, więc przechwycenie w efekcie TEGO komponentu
  // widziałoby już skradziony fokus. Inicjalizator `useState` wykonuje się
  // RAZ, w trakcie pierwszego renderu, PRZED jakimkolwiek efektem poddrzewa.
  const [elementSprzedOtwarciem] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null),
  );

  const oknoRef = useRef<HTMLDialogElement | null>(null);
  const srodekRef = useRef<HTMLDivElement>(null);
  const podsumowanieRef = useRef<HTMLDivElement>(null);
  const zablokowaneWyslanie = useRef(false);
  const wcisnietoNaPrzeslonie = useRef(false);
  const wpisaneDane = useRef(false);
  const fokusPrzedPytaniem = useRef<HTMLElement | null>(null);
  const zamontowane = useRef(true);
  const historia = useRef<WpisHistorii | null>(null);

  const [zapisywanieWlasne, setZapisywanieWlasne] = useState(false);
  const [pytanieOPorzucenie, setPytanieOPorzucenie] = useState(false);
  const [przewijanySrodek, setPrzewijanySrodek] = useState(false);
  const zapisywanie = zapisywanieZZewnatrz || zapisywanieWlasne;

  /** Okno otwiera się jako modalne w chwili wstawienia do dokumentu. */
  const podepnijOkno = useCallback((element: HTMLDialogElement | null) => {
    oknoRef.current = element;
    if (!element || element.open) return;
    if (typeof element.showModal === "function") {
      try {
        element.showModal();
        return;
      } catch {
        // Okno poza dokumentem albo już otwarte niemodalnie — zostaje atrybut.
      }
    }
    element.setAttribute("open", "");
  }, []);

  useEffect(() => {
    zamontowane.current = true;
    zapewnijObszarOgloszen();
    const usun = dodajOkno(znacznik);
    return () => {
      zamontowane.current = false;
      usun();
    };
  }, [znacznik]);

  const rozwiazCelZastepczy = useEffectEvent((): HTMLElement | null => {
    if (fokusPoZamknieciu === undefined) return null;
    if (typeof fokusPoZamknieciu === "string") return document.getElementById(fokusPoZamknieciu);
    return fokusPoZamknieciu();
  });

  useEffect(() => {
    return () => {
      if (dostepnyDoFokusu(elementSprzedOtwarciem)) {
        elementSprzedOtwarciem.focus();
        return;
      }
      const zastepczy = rozwiazCelZastepczy();
      if (dostepnyDoFokusu(zastepczy)) zastepczy.focus();
    };
  }, [elementSprzedOtwarciem]);

  // Fokus startowy formularza: pierwsze pole (potwierdzenie zostaje na „Anuluj”).
  useEffect(() => {
    if (!formularz) return;
    const pole = srodekRef.current?.querySelector<HTMLElement>(SELEKTOR_POL);
    (pole ?? oknoRef.current?.querySelector<HTMLElement>(SELEKTOR_FOKUSOWALNYCH))?.focus();
  }, [formularz]);

  // Nowa lista błędów — fokus na podsumowanie (czytnik odczyta jego treść).
  useEffect(() => {
    if (bledy && bledy.length > 0) podsumowanieRef.current?.focus();
  }, [bledy]);

  const maWpisaneDane = () => (niezapisaneZmiany === undefined ? wpisaneDane.current : niezapisaneZmiany);

  function pokazPytanie() {
    const aktywny = document.activeElement;
    fokusPrzedPytaniem.current = aktywny instanceof HTMLElement && oknoRef.current?.contains(aktywny) ? aktywny : null;
    setPytanieOPorzucenie(true);
  }

  function wrocDoFormularza() {
    setPytanieOPorzucenie(false);
  }

  // Po „Wróć do formularza”: fokus na pole, z którego padło pytanie.
  useEffect(() => {
    if (pytanieOPorzucenie || !formularz) return;
    const cel = fokusPrzedPytaniem.current;
    fokusPrzedPytaniem.current = null;
    if (cel && dostepnyDoFokusu(cel)) cel.focus();
  }, [pytanieOPorzucenie, formularz]);

  /** Jedna droga zamknięcia bez zapisu: Escape, „Wstecz” przeglądarki, prośba przeglądarki o zamknięcie. */
  const zadanieZamkniecia = useEffectEvent((zrodlo: ZrodloZamkniecia) => {
    // „Wstecz” już zdjęło wpis — gdy okno zostaje, wpis wraca na swoje miejsce.
    const zostaje = () => {
      if (zrodlo === "wstecz") dodajWpisHistorii(historia);
    };
    if (pytanieOPorzucenie) {
      zostaje();
      if (zrodlo === "escape") wrocDoFormularza();
      return;
    }
    if (zapisywanie || zablokowaneWyslanie.current) {
      zostaje();
      return;
    }
    if (formularz && maWpisaneDane()) {
      zostaje();
      pokazPytanie();
      return;
    }
    onWycofaj();
  });

  const naKlawisz = useEffectEvent((zdarzenie: KeyboardEvent) => {
    if (!czyNaWierzchu(znacznik)) return;
    if (zdarzenie.key === "Escape") {
      zdarzenie.preventDefault();
      zadanieZamkniecia("escape");
      return;
    }
    if (zdarzenie.key === "Enter") {
      // Formularz wysyła się sam (Enter w polu = wysłanie formularza).
      if (formularz) return;
      const cel = zdarzenie.target as HTMLElement | null;
      const polePotwierdzajace =
        cel?.tagName === "INPUT" &&
        !["checkbox", "radio", "button", "submit", "reset"].includes((cel as HTMLInputElement).type);
      if (!polePotwierdzajace) return;
      zdarzenie.preventDefault();
      onPotwierdz();
      return;
    }
    if (zdarzenie.key === "Tab") {
      const kontener = oknoRef.current;
      if (!kontener) return;
      const fokusowalne = Array.from(kontener.querySelectorAll<HTMLElement>(SELEKTOR_FOKUSOWALNYCH)).filter(widoczny);
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
  });

  useEffect(() => {
    const sluchacz = (zdarzenie: KeyboardEvent) => naKlawisz(zdarzenie);
    document.addEventListener("keydown", sluchacz);
    return () => document.removeEventListener("keydown", sluchacz);
  }, []);

  // Przycisk „Wstecz” przeglądarki: jeden wpis historii na czas otwarcia
  // okna formularza. Wpis powstaje po zamontowaniu (czasomierz zero — w trybie
  // ścisłym Reacta pierwsze, próbne zamontowanie nie zostawia wpisu), a przy
  // zamknięciu okno go zdejmuje, o ile nadal jest bieżący (przejście na inny
  // adres zostawia historię w spokoju).
  const naCofniecie = useEffectEvent(() => {
    const wpis = historia.current;
    if (!wpis?.dodany) return;
    const stan = window.history.state as Record<string, unknown> | null;
    if (stan?.[KLUCZ_WPISU_HISTORII] === wpis.znacznik) return;
    wpis.dodany = false;
    zadanieZamkniecia("wstecz");
  });

  useEffect(() => {
    if (!formularz || typeof window === "undefined") return;
    const czasomierz = window.setTimeout(() => dodajWpisHistorii(historia), 0);
    const sluchacz = () => naCofniecie();
    window.addEventListener("popstate", sluchacz);
    return () => {
      window.clearTimeout(czasomierz);
      window.removeEventListener("popstate", sluchacz);
      const wpis = historia.current;
      historia.current = null;
      const stan = window.history.state as Record<string, unknown> | null;
      if (wpis?.dodany && stan?.[KLUCZ_WPISU_HISTORII] === wpis.znacznik) window.history.back();
    };
  }, [formularz]);

  // Klawiatura telefonu zmniejsza widoczną część strony: okno bierze jej
  // wysokość, a pole z fokusem wraca do widoku.
  useEffect(() => {
    const widok = typeof window === "undefined" ? undefined : window.visualViewport;
    const okno = oknoRef.current;
    if (!widok || !okno) return;
    const dopasuj = () => {
      okno.style.setProperty("--wysokosc-widoku", `${widok.height}px`);
      okno.style.setProperty("--przesuniecie-widoku", `${widok.offsetTop}px`);
      const aktywny = document.activeElement;
      if (aktywny instanceof HTMLElement && srodekRef.current?.contains(aktywny)) {
        aktywny.scrollIntoView?.({ block: "nearest" });
      }
    };
    dopasuj();
    widok.addEventListener("resize", dopasuj);
    widok.addEventListener("scroll", dopasuj);
    return () => {
      widok.removeEventListener("resize", dopasuj);
      widok.removeEventListener("scroll", dopasuj);
    };
  }, []);

  // Środek, który się przewija, jest osiągalny klawiaturą (Tab + strzałki).
  useEffect(() => {
    const srodek = srodekRef.current;
    if (!srodek) return;
    const zmierz = () => setPrzewijanySrodek(srodek.scrollHeight > srodek.clientHeight + 1);
    zmierz();
    const obserwator = typeof ResizeObserver === "function" ? new ResizeObserver(zmierz) : null;
    obserwator?.observe(srodek);
    for (const dziecko of Array.from(srodek.children)) obserwator?.observe(dziecko);
    return () => obserwator?.disconnect();
  }, []);

  function naFokusWSrodku(zdarzenie: SyntheticEvent<HTMLDivElement>) {
    const cel = zdarzenie.target;
    if (cel instanceof HTMLElement && cel !== zdarzenie.currentTarget) cel.scrollIntoView?.({ block: "nearest" });
  }

  // Prośba przeglądarki o zamknięcie (gest „wstecz” telefonu, Escape poza
  // obsługą klawiszy) idzie tą samą drogą co Escape. Gdy przeglądarka mimo
  // odmowy zamknie okno (powtórzona prośba), stan wywołującego idzie za tym,
  // co widać.
  const naAnulowanie = useEffectEvent((zdarzenie: Event) => {
    zdarzenie.preventDefault();
    if (czyNaWierzchu(znacznik)) zadanieZamkniecia("przegladarka");
  });
  const naZamkniecie = useEffectEvent(() => {
    if (zamontowane.current) onWycofaj();
  });

  useEffect(() => {
    const okno = oknoRef.current;
    if (!okno) return;
    const anuluj = (zdarzenie: Event) => naAnulowanie(zdarzenie);
    const zamknij = () => naZamkniecie();
    okno.addEventListener("cancel", anuluj);
    okno.addEventListener("close", zamknij);
    return () => {
      okno.removeEventListener("cancel", anuluj);
      okno.removeEventListener("close", zamknij);
    };
  }, []);

  function naWcisniecie(zdarzenie: MouseEvent<HTMLDialogElement>) {
    wcisnietoNaPrzeslonie.current = zdarzenie.target === zdarzenie.currentTarget;
  }

  function naKlikniecie(zdarzenie: MouseEvent<HTMLDialogElement>) {
    const naPrzeslonie = zdarzenie.target === zdarzenie.currentTarget && wcisnietoNaPrzeslonie.current;
    wcisnietoNaPrzeslonie.current = false;
    if (!naPrzeslonie || formularz) return;
    onWycofaj();
  }

  function wycofaj() {
    if (zapisywanie || zablokowaneWyslanie.current) return;
    onWycofaj();
  }

  function naWyslanie(zdarzenie: FormEvent<HTMLFormElement>) {
    zdarzenie.preventDefault();
    if (zapisywanie || zablokowaneWyslanie.current) return;
    zablokowaneWyslanie.current = true;
    let wynik: void | Promise<unknown>;
    try {
      wynik = onPotwierdz();
    } catch (blad) {
      zablokowaneWyslanie.current = false;
      throw blad;
    }
    if (wynik instanceof Promise) {
      setZapisywanieWlasne(true);
      wynik
        .catch(() => undefined)
        .finally(() => {
          zablokowaneWyslanie.current = false;
          if (zamontowane.current) setZapisywanieWlasne(false);
        });
      return;
    }
    zablokowaneWyslanie.current = false;
  }

  function naZmianePola() {
    wpisaneDane.current = true;
  }

  function idzDoPola(zdarzenie: MouseEvent<HTMLAnchorElement>, idPola: string) {
    zdarzenie.preventDefault();
    const pole = document.getElementById(idPola);
    pole?.focus();
    pole?.scrollIntoView?.({ block: "nearest" });
  }

  const podsumowanieBledow =
    bledy && bledy.length > 0 ? (
      <div
        ref={podsumowanieRef}
        className={style.bledy}
        role="group"
        aria-labelledby={idTytuluBledow}
        tabIndex={-1}
        data-podsumowanie-bledow=""
      >
        <Heading stopien={3} id={idTytuluBledow}>
          {tytulBledow}
        </Heading>
        <ul className={style.listaBledow}>
          {bledy.map((blad, indeks) => (
            <li key={`${blad.idPola ?? "ogolny"}-${indeks}`}>
              {blad.idPola ? (
                <Link href={`#${blad.idPola}`} onClick={(zdarzenie) => idzDoPola(zdarzenie, blad.idPola as string)}>
                  {blad.tresc}
                </Link>
              ) : (
                blad.tresc
              )}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  const srodekPrzewijany = przewijanySrodek
    ? { tabIndex: 0, role: "region" as const, "aria-labelledby": idNaglowka }
    : {};

  return (
    <dialog
      ref={podepnijOkno}
      className={style.okno}
      data-wariant={wariant}
      data-przewijany={przewijanySrodek || undefined}
      aria-modal="true"
      aria-labelledby={idNaglowka}
      aria-describedby={pytanieOPorzucenie ? idPytania : formularz ? (opis ? idOpisu : undefined) : idOpisu}
      aria-busy={zapisywanie || undefined}
      onMouseDown={naWcisniecie}
      onClick={naKlikniecie}
    >
      <div className={style.ramka}>
        <div className={style.glowa}>
          <Heading stopien={2} id={idNaglowka}>
            {tytul}
          </Heading>
        </div>
        {formularz ? (
          <form
            className={style.formularz}
            noValidate
            hidden={pytanieOPorzucenie}
            onSubmit={naWyslanie}
            onInput={naZmianePola}
            onChange={naZmianePola}
          >
            <div ref={srodekRef} className={style.srodek} onFocus={naFokusWSrodku} {...srodekPrzewijany}>
              {podsumowanieBledow}
              {opis && (
                <div id={idOpisu} className={style.opis}>
                  {opis}
                </div>
              )}
              <div className={style.tresc}>{children}</div>
            </div>
            <div className={style.stopka}>
              <DialogActions
                etykietaWycofania={etykietaWycofania}
                etykietaPotwierdzenia={etykietaPotwierdzenia}
                onWycofaj={wycofaj}
                niebezpieczne={niebezpieczne}
                typPotwierdzenia="submit"
                zapisywanie={zapisywanie}
                etykietaZapisywania={etykietaZapisywania}
                fokusPrzyOtwarciu={false}
              />
            </div>
          </form>
        ) : (
          <>
            <div ref={srodekRef} className={style.srodek} onFocus={naFokusWSrodku} {...srodekPrzewijany}>
              <div id={idOpisu} className={style.tresc}>
                {children}
              </div>
            </div>
            <div className={style.stopka}>
              <DialogActions
                etykietaWycofania={etykietaWycofania}
                etykietaPotwierdzenia={etykietaPotwierdzenia}
                onWycofaj={onWycofaj}
                onPotwierdz={onPotwierdz}
                niebezpieczne={niebezpieczne}
              />
            </div>
          </>
        )}
        {pytanieOPorzucenie && (
          <div className={style.pytanie} role="group" aria-labelledby={idPytania}>
            <div className={style.srodek}>
              <Heading stopien={3} id={idPytania}>
                Porzucić wpisane dane?
              </Heading>
              <Text>Wpisane dane nie zostaną zapisane.</Text>
            </div>
            <div className={style.stopka}>
              <DialogActions
                etykietaWycofania="Wróć do formularza"
                etykietaPotwierdzenia="Porzuć"
                onWycofaj={wrocDoFormularza}
                onPotwierdz={onWycofaj}
                niebezpieczne
              />
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
