import { GRUPY } from "@/lib/przelaczenie/grupy";
import ZablokowaneNowyEkran from "./NowyEkran";
import ZablokowaneStaraTresc from "./StaraTresc";

/**
 * Trasa `/logowanie/zablokowane` — konto zablokowane. Adres się nie zmienia: strona czyta rejestr przełączenia
 * (`lib/przelaczenie/grupy.ts`, grupa `logowanie`). Grupa wyłączona → dotychczasowa treść
 * (`StaraTresc.tsx`, przeniesiona bez zmiany); grupa włączona → ekran nowego frontu
 * na szablonie strony publicznej (`NowyEkran.tsx`).
 */
export default function StronaZablokowane() {
  return GRUPY.logowanie.wlaczona ? <ZablokowaneNowyEkran /> : <ZablokowaneStaraTresc />;
}
