import { MenuItem } from "./MenuItem";
import type { NazwaIkony } from "../../atomy/Icon/Icon";
import style from "./MenuItem.module.css";

interface PozycjaGrupy {
  ikona: NazwaIkony;
  etykieta: string;
  href: string;
  biezaca?: boolean | "sekcja";
  licznik?: { wartosc: number; etykieta: string };
}

interface WlasciwosciMenuGroup {
  naglowek: string;
  pozycje: PozycjaGrupy[];
  wPrzygotowaniu?: string[];
}

/**
 * Grupa pozycji menu (M9 + „nagłówek grupy" i linia „W przygotowaniu" z tego
 * samego wiersza specyfikacji). Zero martwych pozycji (ustalenie specyfikacji, cyt. w
 * §3): brakująca funkcja NIE dostaje wyszarzonego `MenuItem` — jest jedną
 * linią tekstu „W przygotowaniu" na dole grupy, bez `href` i bez roli
 * odnośnika.
 */
export function MenuGroup({ naglowek, pozycje, wPrzygotowaniu = [] }: WlasciwosciMenuGroup) {
  return (
    <div className={style.grupa}>
      <p className={style.naglowekGrupy}>{naglowek}</p>
      <ul className={style.lista}>
        {pozycje.map((pozycja) => (
          <li key={pozycja.href}>
            <MenuItem {...pozycja} />
          </li>
        ))}
        {wPrzygotowaniu.map((nazwa) => (
          <li key={nazwa} className={style.wPrzygotowaniu}>
            {nazwa} — w przygotowaniu
          </li>
        ))}
      </ul>
    </div>
  );
}
