import type { ReactNode } from "react";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Icon } from "@/design-system/atomy/Icon/Icon";
import { Text } from "@/design-system/atomy/Text/Text";
import style from "./GrupaProwadzacego.module.css";

interface WlasciwosciKomunikat {
  wariant: "warn" | "error";
  tytul: string;
  /** Stopień nagłówka: 2 pod `h1` ekranu, 3 wewnątrz bloku z własnym `h2`. */
  stopien?: 2 | 3;
  /** Miejsce na `Button` — akcja „co można zrobić”. */
  akcja?: ReactNode;
  children: ReactNode;
}

/**
 * Komunikat stanu i błędu akcji. Wygląd i treść jak `Notice`, ale ze stopniem nagłówka dobranym
 * do miejsca. Błąd ogłasza się czytnikowi od razu (`role="alert"`), ostrzeżenie grzecznie (`role="status"`).
 */
export function Komunikat({ wariant, tytul, stopien = 2, akcja, children }: WlasciwosciKomunikat) {
  return (
    <div
      className={`${style.komunikat} ${wariant === "error" ? style.komunikatBlad : style.komunikatUwaga}`}
      role={wariant === "error" ? "alert" : "status"}
    >
      <Icon nazwa="help" />
      <div className={style.komunikatTresc}>
        <Heading stopien={stopien}>{tytul}</Heading>
        <Text>{children}</Text>
        {akcja && <div className={style.komunikatAkcja}>{akcja}</div>}
      </div>
    </div>
  );
}
