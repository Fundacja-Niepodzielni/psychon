"use client";

import { useEffect, useId, useRef, useState, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { Button } from "../../atomy/Button/Button";
import { Icon, type NazwaIkony } from "../../atomy/Icon/Icon";
import { MenuItem } from "../../molekuly/MenuItem/MenuItem";
import { PanelNav } from "../../organizmy/PanelNav/PanelNav";
import { DostawcaPowloki } from "../KontekstPowloki";
import { DostawcaRamki } from "../KontekstRamki";
import style from "./PowlokaPanelu.module.css";

type WlasciwosciNawigacji = ComponentProps<typeof PanelNav>;

interface GrupaZwinieta {
  naglowek: string;
  pozycje: { ikona: NazwaIkony; etykieta: string; href: string; biezaca?: boolean }[];
  /** Linia „W przygotowaniu: …” pod pozycjami (bez przedrostka i kropki). */
  liniaWPrzygotowaniu?: string;
}

interface WlasciwosciPowlokiPanelu {
  /** Znak na górze menu (dostarcza wywołujący — np. logo Fundacji). */
  logo?: ReactNode;
  uzytkownik: WlasciwosciNawigacji["uzytkownik"];
  grupy: WlasciwosciNawigacji["grupy"];
  /**
   * Grupa zwinięta przyciskiem „{nagłówek} ({liczba pozycji})” tuż przed
   * grupą „Konto” (np. „Dotychczasowy panel”); na wejściu zwinięta, chyba
   * że niesie bieżącą pozycję.
   */
  grupaZwinieta?: GrupaZwinieta;
  /** Nazwa punktu orientacyjnego menu (`nav`); domyślnie „Menu główne”. */
  etykietaMenu?: string;
  /** Linia „W przygotowaniu: …” pod wylogowaniem w grupie „Konto” (bez przedrostka i kropki). */
  liniaKonta?: string;
  /**
   * Nawigacja kliencka po kliknięciu pozycji menu (np. `router.push`). Bez
   * propu pozycje menu są zwykłymi łączami (pełne przejście strony).
   */
  onNawigacja?: (href: string) => void;
  /** Wylogowanie — ostatnia pozycja grupy „Konto”. */
  onWyloguj: () => void;
  wylogowywanie?: boolean;
  /**
   * Rok programu w górnym pasku (np. „2026/27”): „PsychON · rok programu
   * 2026/27”; `null` — sam „PsychON” (rola bez trasy z rokiem).
   */
  rokProgramu?: string | null;
  /** Dodatkowe narzędzia po prawej stronie górnego paska (np. pomoc, powiadomienia). */
  narzedziaPaska?: ReactNode;
  /** Drobne łącza na dole menu (np. deklaracja dostępności, dokumenty prawne). */
  stopka?: ReactNode;
  children: ReactNode;
}

/**
 * Szablon powłoki panelu `PowlokaPanelu` — ramka z makiety 2.0.4
 * (`#s-panel .shell`): menu boczne (karta osoby, grupy, linie „W
 * przygotowaniu”, grupa „Konto”), górny pasek z rokiem programu, treść od
 * lewej bez tła skrzynki. Poniżej 1024 px menu chowa się pod przyciskiem
 * „Menu” w górnym pasku i otwiera jako okno modalne z przyciskiem „Zamknij”
 * (jak `.side.open` w makiecie).
 *
 * Grupa „Konto” przykleja się do dołu menu (`position: sticky`), więc
 * „Wyloguj” jest widoczne bez przewijania menu także przy długim menu;
 * grupa zwinięta (`grupaZwinieta`) stoi tuż przed nią.
 *
 * Powłoka niesie jedyny link skoku „Przejdź do treści” i jedyny `main` pod
 * `id="tresc"`; treść dostaje `DostawcaPowloki`, więc szablon ekranu
 * renderuje zwykły `div` zamiast drugiego `main`, oraz `DostawcaRamki` z menu
 * ramki, po którym nagłówek ekranu poznaje nową ramkę (bez „Wstecz”, okruszek
 * liczony z tego menu regułą z `OkruszekRamki.ts`). Stara powłoka `PanelShell`
 * wstawia tylko `DostawcaPowloki`.
 */
export function PowlokaPanelu({
  logo,
  uzytkownik,
  grupy,
  grupaZwinieta,
  etykietaMenu = "Menu główne",
  liniaKonta,
  onNawigacja,
  onWyloguj,
  wylogowywanie = false,
  rokProgramu = null,
  narzedziaPaska,
  stopka,
  children,
}: WlasciwosciPowlokiPanelu) {
  const [menuOtwarte, setMenuOtwarte] = useState(false);
  const [trescPodKontem, setTrescPodKontem] = useState(false);
  const oknoRef = useRef<HTMLDialogElement | null>(null);
  const bokRef = useRef<HTMLElement | null>(null);
  const zawieraBiezaca = !!grupaZwinieta?.pozycje.some((pozycja) => pozycja.biezaca);
  const biezacyAdres = [...grupy.flatMap((grupa) => grupa.pozycje), ...(grupaZwinieta?.pozycje ?? [])].find(
    (pozycja) => pozycja.biezaca,
  )?.href;

  // Po wejściu i po zmianie trasy: bieżąca pozycja menu widoczna w menu bocznym (nad blokiem „Konto”).
  useEffect(() => {
    if (bokRef.current) odslonBiezacaPozycje(bokRef.current);
  }, [biezacyAdres]);

  // Krawędź „Konto” tylko wtedy, gdy pod przyklejonym blokiem jest treść menu
  // (menu przewijane i nieprzewinięte do końca). Stan odświeża przewinięcie
  // menu, zmiana rozmiaru okna i zmiana wysokości treści menu (np. rozwinięcie grupy).
  // Mierzony jest kontener, który jest na ekranie: okno szuflady, gdy otwarte, inaczej bok.
  useEffect(() => {
    const bok = menuOtwarte ? oknoRef.current : bokRef.current;
    if (!bok) return;
    const sprawdz = () => setTrescPodKontem(bok.scrollHeight - bok.clientHeight - bok.scrollTop > 1);
    sprawdz();
    bok.addEventListener("scroll", sprawdz, { passive: true });
    window.addEventListener("resize", sprawdz);
    const obserwator = typeof ResizeObserver === "function" ? new ResizeObserver(sprawdz) : null;
    for (const dziecko of Array.from(bok.children)) obserwator?.observe(dziecko);
    return () => {
      bok.removeEventListener("scroll", sprawdz);
      window.removeEventListener("resize", sprawdz);
      obserwator?.disconnect();
    };
  }, [menuOtwarte]);

  /** Okno menu istnieje tylko, gdy jest otwarte — otwiera się jako modalne. */
  function podepnijOkno(el: HTMLDialogElement | null) {
    oknoRef.current = el;
    if (!el || el.open) return;
    if (typeof el.showModal === "function") el.showModal();
    else el.setAttribute("open", "");
    // Szuflada: bieżąca pozycja widoczna od razu po otwarciu.
    odslonBiezacaPozycje(el);
  }

  function zamknijMenu() {
    const el = oknoRef.current;
    if (el && typeof el.close === "function" && el.open) el.close();
    else setMenuOtwarte(false);
  }

  /**
   * Zwykłe kliknięcie łącza wewnętrznego w menu idzie przez `onNawigacja`
   * (nawigacja kliencka), gdy wywołujący ją podał. Kliknięcie z modyfikatorem,
   * łącze z `target` i łącze obsłużone już przez kogoś innego (np. `next/link`
   * w stopce) zostają bez zmian.
   */
  function klikniecieWMenu(e: MouseEvent<HTMLElement>) {
    if (!onNawigacja || e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const lacze = e.target instanceof Element ? e.target.closest("a") : null;
    const href = lacze?.getAttribute("href");
    if (!lacze || !href || !href.startsWith("/") || href.startsWith("//") || lacze.getAttribute("target")) return;
    e.preventDefault();
    onNawigacja(href);
  }

  function kliknieciePoOknie(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget) zamknijMenu();
    else if (e.target instanceof Element && e.target.closest("a")) {
      klikniecieWMenu(e);
      zamknijMenu();
    }
  }

  const konto = (
    <>
      {grupaZwinieta && grupaZwinieta.pozycje.length > 0 && (
        // Klucz: grupa zaczyna od nowa (rozwinięta), gdy po zmianie trasy zaczyna nieść bieżącą pozycję.
        <GrupaZwijana key={zawieraBiezaca ? "z-biezaca" : "bez-biezacej"} grupa={grupaZwinieta} />
      )}
      <div
        className={trescPodKontem ? `${style.konto} ${style.kontoNadTrescia}` : style.konto}
        data-konto-menu=""
      >
        <p className={style.kontoNaglowek}>Konto</p>
        <button type="button" className={style.wyloguj} onClick={onWyloguj} disabled={wylogowywanie}>
          <Icon nazwa="out" />
          <span>{wylogowywanie ? "Wylogowywanie…" : "Wyloguj"}</span>
        </button>
        {liniaKonta && <p className={style.wPrzygotowaniu}>{`W przygotowaniu: ${liniaKonta}.`}</p>}
      </div>
    </>
  );

  function zawartoscMenu() {
    return (
      <>
        {logo && <div className={style.logo}>{logo}</div>}
        <PanelNav uzytkownik={uzytkownik} grupy={grupy} etykieta={etykietaMenu} konto={konto} />
        {stopka && <div className={style.stopka}>{stopka}</div>}
      </>
    );
  }

  return (
    <div data-theme="light" data-powloka-panelu="" className={style.powloka}>
      <a href="#tresc" className={style.skok}>
        Przejdź do treści
      </a>

      <aside
        ref={bokRef}
        className={style.bok}
        aria-label="Menu i konto"
        onClick={onNawigacja ? klikniecieWMenu : undefined}
      >
        {zawartoscMenu()}
      </aside>

      {menuOtwarte && (
        <dialog
          id="menu-panelu"
          ref={podepnijOkno}
          aria-label="Menu i konto"
          className={style.okno}
          onClose={() => setMenuOtwarte(false)}
          onClick={kliknieciePoOknie}
        >
          <div className={style.oknoTresc}>
            <div className={style.zamknij}>
              <Button poziom="quiet" rozmiar="sm" type="button" onClick={zamknijMenu}>
                {/* Znak „×” jak w makiecie (`.side .close`); mapa `Icon` nie ma glifu zamknięcia — ten sam wzór co `Toast`. */}
                <span aria-hidden="true" data-znak-zamknij="" className={style.znakZamknij}>
                  ×
                </span>
                Zamknij
              </Button>
            </div>
            {zawartoscMenu()}
          </div>
        </dialog>
      )}

      <div className={style.glowna}>
        <header className={style.pasek}>
          <span className={style.przyciskMenu}>
            <Button
              poziom="outline"
              rozmiar="sm"
              type="button"
              aria-expanded={menuOtwarte}
              aria-controls="menu-panelu"
              onClick={() => setMenuOtwarte(true)}
            >
              <Icon nazwa="menu" rozmiar={16} />
              Menu
            </Button>
          </span>
          <p className={style.rok} data-pasek-programu="">
            {rokProgramu ? (
              <>
                <span className={style.markaZRokiem}>
                  <b>PsychON</b> ·{" "}
                </span>
                rok programu <b>{rokProgramu}</b>
              </>
            ) : (
              <b>PsychON</b>
            )}
          </p>
          <span className={style.odstep} />
          {narzedziaPaska && <div className={style.narzedzia}>{narzedziaPaska}</div>}
        </header>

        <main id="tresc" tabIndex={-1} className={style.tresc}>
          <DostawcaPowloki>
            <DostawcaRamki menu={[...grupy, ...(grupaZwinieta ? [grupaZwinieta] : [])]}>{children}</DostawcaRamki>
          </DostawcaPowloki>
        </main>
      </div>
    </div>
  );
}

/**
 * Grupa zwinięta przyciskiem (np. „Dotychczasowy panel (7)”): na wejściu
 * zwinięta — chyba że niesie bieżącą pozycję (ekran szczegółu pod jej
 * adresem), wtedy rozwinięta, żeby oznaczona pozycja była widoczna; przycisk niesie `aria-expanded` i `aria-controls` listy, lista
 * zwiniętej grupy jest w DOM z atrybutem `hidden`. Każde wystąpienie menu
 * (bok i okno) ma własny identyfikator listy i własny stan.
 */
function GrupaZwijana({ grupa }: { grupa: GrupaZwinieta }) {
  const [rozwinieta, setRozwinieta] = useState(() => grupa.pozycje.some((pozycja) => pozycja.biezaca));
  const idListy = useId();
  return (
    <div className={style.zwijana}>
      <button
        type="button"
        className={style.zwijanaPrzycisk}
        aria-expanded={rozwinieta}
        aria-controls={idListy}
        onClick={() => setRozwinieta((stan) => !stan)}
      >
        <span>{`${grupa.naglowek} (${grupa.pozycje.length})`}</span>
        <span aria-hidden="true" className={style.zwijanaZnak}>
          {rozwinieta ? "−" : "+"}
        </span>
      </button>
      <div id={idListy} hidden={!rozwinieta}>
        <ul className={style.zwijanaLista}>
          {grupa.pozycje.map((pozycja) => (
            <li key={pozycja.href}>
              <MenuItem {...pozycja} />
            </li>
          ))}
        </ul>
        {grupa.liniaWPrzygotowaniu && (
          <p className={style.wPrzygotowaniu}>{`W przygotowaniu: ${grupa.liniaWPrzygotowaniu}.`}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Przewija wyłącznie kontener menu (bok albo okno szuflady) tak, żeby pozycja
 * z `aria-current="page"` stała w całości między górną krawędzią kontenera
 * a górną krawędzią przyklejonego bloku „Konto”. Bez animacji, bez ruchu
 * fokusu, bez przewijania okna; gdy pozycja już jest widoczna, `scrollTop`
 * zostaje bez zmian. Blok „Konto” jest przyklejony, więc po przewinięciu
 * jego położenie może się zmienić — stąd najwyżej trzy przybliżenia.
 */
export function odslonBiezacaPozycje(kontener: HTMLElement): void {
  const pozycja = kontener.querySelector<HTMLElement>('a[aria-current="page"]');
  if (!pozycja) return;
  const konto = kontener.querySelector<HTMLElement>("[data-konto-menu]");
  for (let proba = 0; proba < 3; proba += 1) {
    const ramy = kontener.getBoundingClientRect();
    const p = pozycja.getBoundingClientRect();
    if (p.height === 0) return; // pozycja niewyrenderowana (np. zwinięta grupa)
    const dol = Math.min(ramy.bottom, konto ? konto.getBoundingClientRect().top : ramy.bottom);
    // Cel zaokrąglony na zewnątrz do pełnego piksela: po przewinięciu pozycja
    // nie wystaje ani o ułamek piksela (bez tolerancji podpikselowej).
    let cel = kontener.scrollTop;
    if (p.top < ramy.top) cel = Math.floor(kontener.scrollTop + (p.top - ramy.top));
    else if (p.bottom > dol) cel = Math.ceil(kontener.scrollTop + Math.min(p.bottom - dol, p.top - ramy.top));
    if (cel === kontener.scrollTop) return;
    if (typeof kontener.scrollTo === "function") kontener.scrollTo({ top: cel, behavior: "instant" });
    else kontener.scrollTop = cel;
  }
}
