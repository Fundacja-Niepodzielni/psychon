import { GRUPY } from "@/lib/przelaczenie/grupy";
import WeryfikacjaNowyEkran from "./NowyEkran";
import WeryfikacjaStaraTresc from "./StaraTresc";

/**
 * Trasa `/weryfikacja` — publiczna weryfikacja certyfikatu po numerze. Adres się nie zmienia: strona czyta rejestr przełączenia
 * (`lib/przelaczenie/grupy.ts`, grupa `certyfikatPubliczny`). Grupa wyłączona → dotychczasowa treść
 * (`StaraTresc.tsx`, przeniesiona bez zmiany); grupa włączona → ekran nowego frontu
 * na szablonie strony publicznej (`NowyEkran.tsx`).
 */
export default function StronaWeryfikacja() {
  return GRUPY.certyfikatPubliczny.wlaczona ? <WeryfikacjaNowyEkran /> : <WeryfikacjaStaraTresc />;
}
