import type { ReactNode } from "react";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Icon } from "@/design-system/atomy/Icon/Icon";
import { Text } from "@/design-system/atomy/Text/Text";
import style from "./CertyfikatDokumenty.module.css";

interface WlasciwosciKomunikat {
  wariant: "warn" | "error";
  tytul: string;
  /** Miejsce na `Button` — akcja „co można zrobić”. */
  akcja?: ReactNode;
  children: ReactNode;
}

/**
 * Komunikat stanu i błędu akcji obu ekranów. Wygląd i treść jak `Notice`, ale z
 * nagłówkiem drugiego stopnia, bo stoi bezpośrednio pod `h1` ekranu. Błąd
 * ogłasza się czytnikowi od razu (`role="alert"`), ostrzeżenie grzecznie (`role="status"`).
 */
export function Komunikat({ wariant, tytul, akcja, children }: WlasciwosciKomunikat) {
  return (
    <div
      className={`${style.komunikat} ${wariant === "error" ? style.komunikatBlad : style.komunikatUwaga}`}
      role={wariant === "error" ? "alert" : "status"}
    >
      <Icon nazwa="help" />
      <div className={style.komunikatTresc}>
        <Heading stopien={2}>{tytul}</Heading>
        <Text>{children}</Text>
        {akcja && <div className={style.komunikatAkcja}>{akcja}</div>}
      </div>
    </div>
  );
}
