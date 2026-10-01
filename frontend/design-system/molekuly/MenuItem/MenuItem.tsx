import { Icon, type NazwaIkony } from "../../atomy/Icon/Icon";
import { Text } from "../../atomy/Text/Text";
import { Num } from "../../atomy/Num/Num";
import style from "./MenuItem.module.css";

interface LicznikMenuItem {
  wartosc: number;
  etykieta: string;
}

interface WlasciwosciMenuItem {
  ikona: NazwaIkony;
  etykieta: string;
  href: string;
  /**
   * `true` — ekran pozycji jest bieżącą stroną (`aria-current="page"`);
   * `"sekcja"` — bieżąca strona jest podstroną tej pozycji i nie ma własnej
   * pozycji w menu (`aria-current="true"`, ta sama barwa tła).
   */
  biezaca?: boolean | "sekcja";
  licznik?: LicznikMenuItem;
}

/**
 * Pozycja menu `MenuItem` (M9). `Icon` + `Text` + licznik (`Num`), złożone z
 * atomów warstwy 2. Bieżąca pozycja niesie `aria-current="page"` (a nie
 * samą barwą tła w `.module.css`); pozycja-rodzic bieżącej podstrony bez
 * własnej pozycji w menu (`biezaca="sekcja"`) niesie `aria-current="true"`.
 */
export function MenuItem({ ikona, etykieta, href, biezaca = false, licznik }: WlasciwosciMenuItem) {
  return (
    <a
      href={href}
      aria-current={biezaca === "sekcja" ? "true" : biezaca ? "page" : undefined}
      className={`${style.pozycja} ${biezaca ? style.biezaca : ""}`.trim()}
    >
      <Icon nazwa={ikona} rozmiar={18} />
      <Text>{etykieta}</Text>
      {licznik && <Num wartosc={licznik.wartosc} etykieta={licznik.etykieta} />}
    </a>
  );
}
