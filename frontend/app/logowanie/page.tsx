import { GRUPY } from "@/lib/przelaczenie/grupy";
import LogowanieNowyEkran from "./NowyEkran";
import LogowanieStaraTresc from "./StaraTresc";

/**
 * Trasa `/logowanie` — logowanie przez Konta Niepodzielni. Adres się nie zmienia: strona czyta rejestr przełączenia
 * (`lib/przelaczenie/grupy.ts`, grupa `logowanie`). Grupa wyłączona → dotychczasowa treść
 * (`StaraTresc.tsx`, przeniesiona bez zmiany); grupa włączona → ekran nowego frontu
 * na szablonie strony publicznej (`NowyEkran.tsx`).
 */
export default function StronaLogowanie() {
  return GRUPY.logowanie.wlaczona ? <LogowanieNowyEkran /> : <LogowanieStaraTresc />;
}
