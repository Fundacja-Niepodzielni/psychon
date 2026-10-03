import type { ReactNode } from "react";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Icon } from "@/design-system/atomy/Icon/Icon";
import style from "./publiczne.module.css";

export type WariantKomunikatu = "info" | "ok" | "warn" | "error";

interface WlasciwosciKomunikatu {
  wariant: WariantKomunikatu;
  /** Tytuł jako nagłówek drugiego stopnia — komunikat stoi wprost pod `h1` ekranu. */
  tytul?: string;
  /** Miejsce na `Button` — co można zrobić. */
  akcja?: ReactNode;
  children: ReactNode;
}

/**
 * Komunikat ekranów publicznych. Wygląd jak `Notice`, ale tytuł (opcjonalny)
 * jest nagłówkiem drugiego stopnia — `Notice` niesie zawsze `h3`, co pod `h1`
 * łamałoby kolejność nagłówków. Rola jak w starym `Alert`: błąd ogłasza się od
 * razu (`role="alert"`), pozostałe warianty grzecznie (`role="status"`).
 * Barwa nigdy nie niesie stanu sama — niesie go treść.
 */
export function Komunikat({ wariant, tytul, akcja, children }: WlasciwosciKomunikatu) {
  return (
    <div className={`${style.komunikat} ${style[wariant]}`} role={wariant === "error" ? "alert" : "status"}>
      <Icon nazwa={wariant === "ok" ? "award" : "help"} />
      <div className={style.komunikatTresc}>
        {tytul && <Heading stopien={2}>{tytul}</Heading>}
        <div className={style.akapity}>{children}</div>
        {akcja && <div className={style.komunikatAkcja}>{akcja}</div>}
      </div>
    </div>
  );
}
