"use client";

import { Link as GlifLinku, List, ListOrdered, Redo2, Undo2 } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Button } from "../../atomy/Button/Button";
import { ErrorText } from "../../atomy/ErrorText/ErrorText";
import { Hint } from "../../atomy/Hint/Hint";
import { Input } from "../../atomy/Input/Input";
import { Label } from "../../atomy/Label/Label";
import { Select } from "../../atomy/Select/Select";
import { TrescLekcji } from "../TrescLekcji/TrescLekcji";
import stylTresci from "../TrescLekcji/TrescLekcji.module.css";
import style from "./EdytorTresci.module.css";
import type { AkcjaPaska, Silnik, StanPaska, StylTekstu } from "./silnik";
import { LIMIT_ZNAKOW, liczZnaki } from "./zapis";

interface WlasciwosciEdytorTresci {
  /** Treść lekcji w podzbiorze Markdown — ten sam tekst, który idzie do zapisu. */
  wartosc: string;
  /** Wołane wyłącznie po zmianie dokonanej przez osobę; oddaje tekst do wysłania. */
  onZmiana: (tekst: string) => void;
  /** Nazwa obszaru edycji dla czytnika ekranu. */
  etykieta?: string;
  id?: string;
  /** Błąd spoza molekuły (np. odpowiedź zaplecza); błąd limitu molekuła pokazuje sama. */
  blad?: string;
}

const STYLE_TEKSTU: { wartosc: StylTekstu; etykieta: string }[] = [
  { wartosc: "akapit", etykieta: "Zwykły tekst" },
  { wartosc: "naglowek", etykieta: "Nagłówek" },
  { wartosc: "mniejszy-naglowek", etykieta: "Mniejszy nagłówek" },
];

const STAN_BEZ_SILNIKA: StanPaska = {
  styl: "akapit",
  pogrubienie: false,
  kursywa: false,
  listaPunktowana: false,
  listaNumerowana: false,
  link: null,
  moznaCofnac: false,
  moznaPonowic: false,
};

const ODMOWA_ADRESU =
  "Ten adres nie może być linkiem. Podaj adres zaczynający się od https://, http://, mailto: albo od ukośnika /.";

const bezSubskrypcji = () => () => {};
const stanBezSilnika = () => STAN_BEZ_SILNIKA;

function grupujTysiace(liczba: number): string {
  return String(liczba).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function odmianaZnakow(liczba: number): string {
  const reszta10 = liczba % 10;
  const reszta100 = liczba % 100;
  if (liczba === 1) return "znak";
  if (reszta10 >= 2 && reszta10 <= 4 && !(reszta100 >= 12 && reszta100 <= 14)) return "znaki";
  return "znaków";
}

/** Glif jak w atomie `Icon`: ta sama kreska, zawsze ukryty przed czytnikiem. */
const GLIF = { "aria-hidden": true, width: 20, height: 20, strokeWidth: 1.8, color: "currentColor" } as const;

/** Kontrolki paska w kolejności dokumentu, bez nieaktywnych. */
function kontrolkiPaska(pasek: HTMLElement): HTMLButtonElement[] {
  return Array.from(pasek.querySelectorAll<HTMLButtonElement>("button")).filter((przycisk) => !przycisk.disabled);
}

/**
 * Edytor treści lekcji `EdytorTresci`: obszar edycji z klasycznym paskiem
 * (styl tekstu, pogrubienie, kursywa, listy, link, cofnij, ponów).
 *
 * Wejście i wyjście to ten sam tekst w podzbiorze Markdown, który opisuje
 * kontrakt. Molekuła niczego nie zapisuje i nie zna tras; `onZmiana` woła
 * wyłącznie po zmianie dokonanej przez osobę — samo otwarcie treści nie
 * zmienia w niej ani jednego znaku. Blok, którego osoba nie ruszyła, wraca
 * do tekstu znak w znak, także gdy zawiera zapis spoza podzbioru (surowy
 * HTML, tabela, obraz) — taki zapis jest tu, jak u uczestnika, zwykłym tekstem.
 *
 * Silnik edycji jest ładowany importem dynamicznym po zamontowaniu, więc jego
 * kod trafia tylko na trasy, które tej molekuły używają. Do czasu wczytania
 * treść jest pokazana tak, jak zobaczy ją uczestnik, a pasek jest nieaktywny.
 *
 * Pasek ma jeden przystanek Tab; po kontrolkach chodzą strzałki, Home i End.
 * Skróty w obszarze edycji: Ctrl+B, Ctrl+I, Ctrl+Z, Ctrl+Shift+Z.
 */
export function EdytorTresci({ wartosc, onZmiana, etykieta = "Treść lekcji", id, blad }: WlasciwosciEdytorTresci) {
  const idGenerowany = useId();
  const baza = id ?? idGenerowany;
  const idObszaru = `${baza}-obszar`;
  const idLicznika = `${baza}-licznik`;
  const idBledu = `${baza}-blad`;
  const idPanelu = `${baza}-link`;
  const idAdresu = `${baza}-link-adres`;

  const obszarRef = useRef<HTMLDivElement>(null);
  const pasekRef = useRef<HTMLDivElement>(null);
  const przyciskLinkuRef = useRef<HTMLButtonElement>(null);
  const onZmianaRef = useRef(onZmiana);
  const wartoscRef = useRef(wartosc);
  /** Tekst, który silnik już zna — zmiana `wartosc` na inny oznacza treść z zewnątrz. */
  const tekstSilnikaRef = useRef(wartosc);

  const [silnik, setSilnik] = useState<Silnik | null>(null);
  const [panel, setPanel] = useState<{ adres: string; odmowa: boolean } | null>(null);

  const stan = useSyncExternalStore(
    silnik ? silnik.subskrybuj : bezSubskrypcji,
    silnik ? silnik.stan : stanBezSilnika,
    stanBezSilnika,
  );

  const liczba = liczZnaki(wartosc);
  const nadmiar = liczba - LIMIT_ZNAKOW;
  const bladLimitu =
    nadmiar > 0
      ? `Przekroczono limit o ${grupujTysiace(nadmiar)} ${odmianaZnakow(nadmiar)} (limit: ${grupujTysiace(LIMIT_ZNAKOW)}). Skróć treść, żeby ją zapisać.`
      : null;
  const trescBledu = bladLimitu ?? blad ?? null;

  useEffect(() => {
    onZmianaRef.current = onZmiana;
    wartoscRef.current = wartosc;
  });

  useEffect(() => {
    let odwolano = false;
    let utworzony: Silnik | null = null;
    void import("./silnik").then(({ utworzSilnik }) => {
      const element = obszarRef.current;
      if (odwolano || element === null) {
        return;
      }
      tekstSilnikaRef.current = wartoscRef.current;
      utworzony = utworzSilnik({
        element,
        wartosc: wartoscRef.current,
        onZmiana: (tekst) => {
          tekstSilnikaRef.current = tekst;
          onZmianaRef.current(tekst);
        },
        atrybuty: {},
      });
      setSilnik(utworzony);
    });
    return () => {
      odwolano = true;
      utworzony?.zniszcz();
    };
  }, []);

  // Treść podana z zewnątrz (np. wczytana lekcja) zastępuje dokument; tekst,
  // który silnik sam przed chwilą oddał, niczego nie zmienia.
  useEffect(() => {
    if (silnik !== null && wartosc !== tekstSilnikaRef.current) {
      tekstSilnikaRef.current = wartosc;
      silnik.ustawTresc(wartosc);
    }
  }, [silnik, wartosc]);

  const maBlad = trescBledu !== null;
  useEffect(() => {
    silnik?.ustawAtrybuty({
      id: idObszaru,
      role: "textbox",
      "aria-multiline": "true",
      "aria-label": etykieta,
      "aria-describedby": maBlad ? `${idLicznika} ${idBledu}` : idLicznika,
      ...(maBlad ? { "aria-invalid": "true" } : {}),
      class: stylTresci.tresc,
    });
  }, [silnik, etykieta, idObszaru, idLicznika, idBledu, maBlad]);

  // Jeden przystanek Tab na pasku: dokładnie jedna aktywna kontrolka ma
  // `tabindex="0"`. Gdy dotychczasowa stała się nieaktywna, przystankiem
  // zostaje pierwsza aktywna.
  useEffect(() => {
    const pasek = pasekRef.current;
    if (pasek === null) {
      return;
    }
    const aktywne = kontrolkiPaska(pasek);
    const przystanek = aktywne.find((przycisk) => przycisk.getAttribute("tabindex") === "0") ?? aktywne[0];
    pasek.querySelectorAll("button").forEach((przycisk) => {
      przycisk.setAttribute("tabindex", przycisk === przystanek ? "0" : "-1");
    });
  });

  // Fokus trafia do pola raz, przy otwarciu panelu — nie przy każdej literze adresu.
  const panelOtwarty = panel !== null;
  useEffect(() => {
    if (panelOtwarty) {
      document.getElementById(idAdresu)?.focus();
    }
  }, [panelOtwarty, idAdresu]);

  function przeniesPrzystanek(cel: HTMLButtonElement) {
    pasekRef.current?.querySelectorAll("button").forEach((przycisk) => {
      przycisk.setAttribute("tabindex", przycisk === cel ? "0" : "-1");
    });
  }

  function klawiszePaska(zdarzenie: KeyboardEvent<HTMLDivElement>) {
    const pasek = pasekRef.current;
    const cel = zdarzenie.target;
    if (pasek === null || !(cel instanceof HTMLButtonElement) || !pasek.contains(cel)) {
      return;
    }
    // Rozwinięta lista stylu sama obsługuje Home i End.
    const rozwinieta = cel.getAttribute("aria-expanded") === "true" && cel.getAttribute("role") === "combobox";
    const aktywne = kontrolkiPaska(pasek);
    const indeks = aktywne.indexOf(cel);
    let nastepny: number | null = null;
    if (zdarzenie.key === "ArrowRight") nastepny = (indeks + 1) % aktywne.length;
    if (zdarzenie.key === "ArrowLeft") nastepny = (indeks - 1 + aktywne.length) % aktywne.length;
    if (zdarzenie.key === "Home" && !rozwinieta) nastepny = 0;
    if (zdarzenie.key === "End" && !rozwinieta) nastepny = aktywne.length - 1;
    if (nastepny === null || indeks === -1) {
      return;
    }
    zdarzenie.preventDefault();
    zdarzenie.stopPropagation();
    przeniesPrzystanek(aktywne[nastepny]);
    aktywne[nastepny].focus();
  }

  /** Kliknięcie myszą w przycisk paska nie zabiera fokusu ani zaznaczenia z treści. */
  function zostawFokus(zdarzenie: MouseEvent<HTMLButtonElement>) {
    zdarzenie.preventDefault();
  }

  function przyciskPaska(akcja: AkcjaPaska, nazwa: string, wcisniety: boolean | undefined, aktywny: boolean, glif: ReactNode) {
    return (
      <button
        type="button"
        className={style.przycisk}
        aria-label={nazwa}
        title={nazwa}
        aria-pressed={wcisniety}
        disabled={silnik === null || !aktywny}
        onMouseDown={zostawFokus}
        onClick={() => silnik?.wykonaj(akcja)}
      >
        {glif}
      </button>
    );
  }

  function otworzPanel() {
    setPanel((poprzedni) => (poprzedni === null ? { adres: stan.link ?? "", odmowa: false } : null));
  }

  function zamknijPanel() {
    setPanel(null);
    przyciskLinkuRef.current?.focus();
  }

  function zastosujLink() {
    if (silnik === null || panel === null) {
      return;
    }
    if (!silnik.ustawLink(panel.adres)) {
      setPanel({ adres: panel.adres, odmowa: true });
      return;
    }
    setPanel(null);
  }

  function usunLink() {
    silnik?.usunLink();
    setPanel(null);
  }

  function klawiszePanelu(zdarzenie: KeyboardEvent<HTMLDivElement>) {
    if (zdarzenie.key === "Enter" && zdarzenie.target instanceof HTMLInputElement) {
      zdarzenie.preventDefault();
      zastosujLink();
    } else if (zdarzenie.key === "Escape") {
      zdarzenie.preventDefault();
      zamknijPanel();
    }
  }

  return (
    <div className={style.pojemnik}>
      <div className={style.ramka} data-niepoprawny={maBlad || undefined}>
        <div
          ref={pasekRef}
          className={style.pasek}
          role="toolbar"
          aria-label="Formatowanie treści"
          aria-controls={idObszaru}
          onKeyDown={klawiszePaska}
          onFocus={(zdarzenie) => {
            if (zdarzenie.target instanceof HTMLButtonElement) {
              przeniesPrzystanek(zdarzenie.target);
            }
          }}
        >
          <span className={style.styl} title="Styl tekstu">
            <Select
              id={`${baza}-styl`}
              aria-label="Styl tekstu"
              opcje={STYLE_TEKSTU}
              wartosc={stan.styl}
              disabled={silnik === null}
              onZmiana={(wybrany) => silnik?.ustawStyl(wybrany as StylTekstu)}
            />
          </span>
          {przyciskPaska("pogrubienie", "Pogrubienie", stan.pogrubienie, true, <b aria-hidden="true">B</b>)}
          {przyciskPaska(
            "kursywa",
            "Kursywa",
            stan.kursywa,
            true,
            <span className={style.kursywa} aria-hidden="true">
              I
            </span>,
          )}
          <span className={style.separator} aria-hidden="true" />
          {przyciskPaska("lista-punktowana", "Lista punktowana", stan.listaPunktowana, true, <List {...GLIF} />)}
          {przyciskPaska("lista-numerowana", "Lista numerowana", stan.listaNumerowana, true, <ListOrdered {...GLIF} />)}
          <span className={style.separator} aria-hidden="true" />
          <button
            ref={przyciskLinkuRef}
            type="button"
            className={style.przycisk}
            aria-label="Link"
            title="Link"
            aria-expanded={panel !== null}
            aria-controls={idPanelu}
            disabled={silnik === null}
            onMouseDown={zostawFokus}
            onClick={otworzPanel}
          >
            <GlifLinku {...GLIF} />
          </button>
          <span className={style.grupa}>
            <span className={style.separator} aria-hidden="true" />
            {przyciskPaska("cofnij", "Cofnij", undefined, stan.moznaCofnac, <Undo2 {...GLIF} />)}
            {przyciskPaska("ponow", "Ponów", undefined, stan.moznaPonowic, <Redo2 {...GLIF} />)}
          </span>
        </div>

        <div id={idPanelu} hidden={panel === null}>
          {panel !== null && (
            // Grupa pól, nie formularz: molekuła staje wewnątrz formularza lekcji.
            <div className={style.panelLinku} role="group" aria-label="Link" onKeyDown={klawiszePanelu}>
              <div className={style.poleAdresu}>
                <Label htmlFor={idAdresu} dzieci="Adres linku" />
                <Input
                  id={idAdresu}
                  rodzaj="tekst"
                  value={panel.adres}
                  onChange={(zdarzenie) => setPanel({ adres: zdarzenie.target.value, odmowa: false })}
                  niepoprawny={panel.odmowa}
                  aria-describedby={panel.odmowa ? `${idAdresu}-blad` : undefined}
                  autoComplete="off"
                  spellCheck={false}
                />
                {panel.odmowa && <ErrorText id={`${idAdresu}-blad`}>{ODMOWA_ADRESU}</ErrorText>}
              </div>
              <div className={style.akcjePanelu}>
                <Button type="button" poziom="outline" rozmiar="sm" onClick={zastosujLink}>
                  {stan.link === null ? "Wstaw link" : "Zmień link"}
                </Button>
                {stan.link !== null && (
                  <Button type="button" poziom="quiet" rozmiar="sm" niebezpieczny onClick={usunLink}>
                    Usuń link
                  </Button>
                )}
                <Button type="button" poziom="quiet" rozmiar="sm" onClick={zamknijPanel}>
                  Anuluj
                </Button>
              </div>
            </div>
          )}
        </div>

        {silnik === null && (
          <div className={style.zastepczy} aria-busy="true">
            <TrescLekcji tresc={wartosc} />
          </div>
        )}
        <div ref={obszarRef} className={style.obszar} />
      </div>

      {trescBledu !== null && <ErrorText id={idBledu}>{trescBledu}</ErrorText>}
      <div className={style.stopka}>
        <Hint id={idLicznika}>{`${grupujTysiace(liczba)} z ${grupujTysiace(LIMIT_ZNAKOW)} znaków`}</Hint>
        <Hint>Uczestnik zobaczy treść w tych samych stylach.</Hint>
      </div>
    </div>
  );
}
