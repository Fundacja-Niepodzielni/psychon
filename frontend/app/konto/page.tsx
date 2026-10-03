import { GRUPY } from "@/lib/przelaczenie/grupy";
import KontoNowyEkran from "./NowyEkran";
import KontoStaraTresc from "./StaraTresc";

/**
 * Trasa `/konto` — tożsamość z logowania i wylogowanie. Adres się nie zmienia: strona czyta rejestr przełączenia
 * (`lib/przelaczenie/grupy.ts`, grupa `twojeKonto`). Grupa wyłączona → dotychczasowa treść
 * (`StaraTresc.tsx`, przeniesiona bez zmiany); grupa włączona → ekran nowego frontu
 * na szablonie strony publicznej (`NowyEkran.tsx`).
 */
export default function StronaKonto() {
  return GRUPY.twojeKonto.wlaczona ? <KontoNowyEkran /> : <KontoStaraTresc />;
}
