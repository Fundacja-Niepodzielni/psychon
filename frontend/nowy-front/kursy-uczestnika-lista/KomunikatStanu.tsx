import type { ReactNode } from "react";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Icon } from "@/design-system/atomy/Icon/Icon";
import { Text } from "@/design-system/atomy/Text/Text";
import style from "./KomunikatStanu.module.css";

interface WlasciwosciKomunikatuStanu {
  tytul: string;
  /** Miejsce na `Button` — co można zrobić dalej. */
  akcja: ReactNode;
  children: ReactNode;
}

/**
 * Komunikat błędu na ekranie bez danych (brak połączenia, błąd serwera): wygląd jak
 * `Notice`, ale tytuł jest nagłówkiem drugiego stopnia — pod `h1` ekranu `Notice`
 * (zawsze `h3`) łamałby kolejność nagłówków. Ten sam wzór ma strona kursu uczestnika.
 */
export function KomunikatStanu({ tytul, akcja, children }: WlasciwosciKomunikatuStanu) {
  return (
    <div className={style.komunikat} role="alert">
      <Icon nazwa="help" />
      <div className={style.tresc}>
        <Heading stopien={2}>{tytul}</Heading>
        <Text>{children}</Text>
        <div className={style.akcja}>{akcja}</div>
      </div>
    </div>
  );
}
