"use client";

import { useRef, useState, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { Button } from "../../atomy/Button/Button";
import { Icon } from "../../atomy/Icon/Icon";
import { PanelNav } from "../../organizmy/PanelNav/PanelNav";
import { DostawcaPowloki } from "../KontekstPowloki";
import style from "./PowlokaPanelu.module.css";

type WlasciwosciNawigacji = ComponentProps<typeof PanelNav>;

interface WlasciwosciPowlokiPanelu {
  /** Znak na górze menu (dostarcza wywołujący — np. logo Fundacji). */
  logo?: ReactNode;
  uzytkownik: WlasciwosciNawigacji["uzytkownik"];
  grupy: WlasciwosciNawigacji["grupy"];
  /** Wylogowanie — ostatnia pozycja grupy „Konto”. */
  onWyloguj: () => void;
  wylogowywanie?: boolean;
  /** Rok programu w górnym pasku (np. „2026/27”); `null` — pasek bez roku. */
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
 * Powłoka niesie jedyny link skoku „Przejdź do treści” i jedyny `main` pod
 * `id="tresc"`; treść dostaje `DostawcaPowloki`, więc szablon ekranu
 * renderuje zwykły `div` zamiast drugiego `main`.
 */
export function PowlokaPanelu({
  logo,
  uzytkownik,
  grupy,
  onWyloguj,
  wylogowywanie = false,
  rokProgramu = null,
  narzedziaPaska,
  stopka,
  children,
}: WlasciwosciPowlokiPanelu) {
  const [menuOtwarte, setMenuOtwarte] = useState(false);
  const oknoRef = useRef<HTMLDialogElement | null>(null);

  /** Okno menu istnieje tylko, gdy jest otwarte — otwiera się jako modalne. */
  function podepnijOkno(el: HTMLDialogElement | null) {
    oknoRef.current = el;
    if (!el || el.open) return;
    if (typeof el.showModal === "function") el.showModal();
    else el.setAttribute("open", "");
  }

  function zamknijMenu() {
    const el = oknoRef.current;
    if (el && typeof el.close === "function" && el.open) el.close();
    else setMenuOtwarte(false);
  }

  function kliknieciePoOknie(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget) zamknijMenu();
    else if (e.target instanceof Element && e.target.closest("a")) zamknijMenu();
  }

  const konto = (
    <div className={style.konto}>
      <p className={style.kontoNaglowek}>Konto</p>
      <button type="button" className={style.wyloguj} onClick={onWyloguj} disabled={wylogowywanie}>
        <Icon nazwa="out" />
        <span>{wylogowywanie ? "Wylogowywanie…" : "Wyloguj"}</span>
      </button>
    </div>
  );

  function zawartoscMenu() {
    return (
      <>
        {logo && <div className={style.logo}>{logo}</div>}
        <PanelNav uzytkownik={uzytkownik} grupy={grupy} etykieta="Menu główne" konto={konto} />
        {stopka && <div className={style.stopka}>{stopka}</div>}
      </>
    );
  }

  return (
    <div data-theme="light" data-powloka-panelu="" className={style.powloka}>
      <a href="#tresc" className={style.skok}>
        Przejdź do treści
      </a>

      <aside className={style.bok} aria-label="Menu i konto">
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
              Menu
            </Button>
          </span>
          {rokProgramu && (
            <p className={style.rok}>
              <span className={style.rokEtykieta}>Rok programu: </span>
              <b>{rokProgramu}</b>
            </p>
          )}
          <span className={style.odstep} />
          {narzedziaPaska && <div className={style.narzedzia}>{narzedziaPaska}</div>}
        </header>

        <main id="tresc" tabIndex={-1} className={style.tresc}>
          <DostawcaPowloki>{children}</DostawcaPowloki>
        </main>
      </div>
    </div>
  );
}
