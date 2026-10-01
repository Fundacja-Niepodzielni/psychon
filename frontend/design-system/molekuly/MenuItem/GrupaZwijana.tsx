"use client";

import { useId, useState } from "react";
import type { NazwaIkony } from "../../atomy/Icon/Icon";
import { MenuItem } from "./MenuItem";
import style from "./GrupaZwijana.module.css";

interface PozycjaGrupyZwijanej {
  ikona: NazwaIkony;
  etykieta: string;
  href: string;
  biezaca?: boolean | "sekcja";
  licznik?: { wartosc: number; etykieta: string };
}

export interface GrupaZwijanaDane {
  naglowek: string;
  pozycje: PozycjaGrupyZwijanej[];
  /** Linia „W przygotowaniu: …” pod pozycjami, wewnątrz części zwijanej (bez przedrostka i kropki). */
  liniaWPrzygotowaniu?: string;
}

/**
 * Grupa menu zwijana przyciskiem „{nagłówek} ({liczba pozycji})” (np. „Ustawienia (3)”,
 * „Dotychczasowy panel (6)”) — JEDNA definicja zwijania dla wszystkich grup zwijanych
 * menu: rysuje ją `PanelNav` (grupy z flagą `zwijana`) i szablon `PowlokaPanelu`
 * („Dotychczasowy panel” tuż przed grupą „Konto”).
 *
 * Na wejściu zwinięta — chyba że niesie pozycję bieżącą (`biezaca: true` albo `"sekcja"`:
 * ekran pozycji grupy albo jej podstrona), wtedy rozwinięta, żeby oznaczona pozycja była
 * widoczna. Gdy po zmianie trasy grupa zaczyna nieść pozycję bieżącą (albo przestaje),
 * zaczyna od nowa w stanie wynikającym z trasy; ręczne zwinięcie i rozwinięcie działa na
 * każdym ekranie i zostaje, dopóki trasa nie przenosi bieżącej pozycji do grupy lub z niej.
 *
 * Przycisk jest prawdziwym `button` (Enter i Spacja działają natywnie), niesie
 * `aria-expanded` i `aria-controls` listy; lista zwiniętej grupy jest w DOM z atrybutem
 * `hidden`, więc jej pozycje nie biorą fokusu z Tab. Każde wystąpienie menu (bok i okno
 * poniżej 1024 px) ma własny identyfikator listy i własny stan.
 */
export function GrupaZwijana({ grupa }: { grupa: GrupaZwijanaDane }) {
  const zawieraBiezaca = grupa.pozycje.some((pozycja) => pozycja.biezaca);
  // Klucz: grupa zaczyna od nowa, gdy po zmianie trasy zaczyna (przestaje) nieść bieżącą pozycję.
  return <StanGrupyZwijanej key={zawieraBiezaca ? "z-biezaca" : "bez-biezacej"} grupa={grupa} rozwinietaNaWejsciu={zawieraBiezaca} />;
}

function StanGrupyZwijanej({ grupa, rozwinietaNaWejsciu }: { grupa: GrupaZwijanaDane; rozwinietaNaWejsciu: boolean }) {
  const [rozwinieta, setRozwinieta] = useState(rozwinietaNaWejsciu);
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
