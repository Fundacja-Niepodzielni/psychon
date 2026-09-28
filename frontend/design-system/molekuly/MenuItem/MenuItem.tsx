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
  biezaca?: boolean;
  licznik?: LicznikMenuItem;
}

/**
 * Pozycja menu `MenuItem` (M9). `Icon` + `Text` + licznik (`Num`), złożone z
 * atomów warstwy 2. Bieżąca pozycja niesie `aria-current="page"` (a nie
 * samą barwą tła w `.module.css`).
 */
export function MenuItem({ ikona, etykieta, href, biezaca = false, licznik }: WlasciwosciMenuItem) {
  return (
    <a
      href={href}
      aria-current={biezaca ? "page" : undefined}
      className={`${style.pozycja} ${biezaca ? style.biezaca : ""}`.trim()}
    >
      <Icon nazwa={ikona} rozmiar={18} />
      <Text>{etykieta}</Text>
      {licznik && <Num wartosc={licznik.wartosc} etykieta={licznik.etykieta} />}
    </a>
  );
}
