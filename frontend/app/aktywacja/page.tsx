import { GRUPY } from "@/lib/przelaczenie/grupy";
import AktywacjaNowyEkran from "./NowyEkran";
import AktywacjaStaraTresc from "./StaraTresc";

/**
 * Trasa `/aktywacja` — aktywacja konta z zaproszenia. Adres się nie zmienia: strona czyta rejestr przełączenia
 * (`lib/przelaczenie/grupy.ts`, grupa `aktywacjaKonta`). Grupa wyłączona → dotychczasowa treść
 * (`StaraTresc.tsx`, przeniesiona bez zmiany); grupa włączona → ekran nowego frontu
 * na szablonie strony publicznej (`NowyEkran.tsx`).
 */
export default function StronaAktywacja() {
  return GRUPY.aktywacjaKonta.wlaczona ? <AktywacjaNowyEkran /> : <AktywacjaStaraTresc />;
}
