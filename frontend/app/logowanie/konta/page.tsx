import { GRUPY } from "@/lib/przelaczenie/grupy";
import LogowanieKontaNowyEkran from "./NowyEkran";
import LogowanieKontaStaraTresc from "./StaraTresc";

/**
 * Trasa `/logowanie/konta` — powrót z Kont Niepodzielni po logowaniu (przekierowanie z zachowaniem `?error=`). Adres się nie zmienia: strona czyta rejestr przełączenia
 * (`lib/przelaczenie/grupy.ts`, grupa `logowanie`). Grupa wyłączona → dotychczasowa treść
 * (`StaraTresc.tsx`, przeniesiona bez zmiany); grupa włączona → ekran nowego frontu
 * na szablonie strony publicznej (`NowyEkran.tsx`).
 */
export default function StronaLogowanieKonta() {
  return GRUPY.logowanie.wlaczona ? <LogowanieKontaNowyEkran /> : <LogowanieKontaStaraTresc />;
}
