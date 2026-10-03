import { GRUPY } from "@/lib/przelaczenie/grupy";
import ZacznijTutajNowyEkran from "./NowyEkran";
import ZacznijTutajStaraTresc from "./StaraTresc";

/**
 * Trasa `/panel/start` — ekran „Zacznij tutaj” uczestnika. Adres się nie zmienia: strona czyta
 * rejestr przełączenia (`lib/przelaczenie/grupy.ts`, grupa `zacznijTutaj`). Grupa wyłączona →
 * dotychczasowa treść (`StaraTresc.tsx`, przeniesiona bez zmiany); grupa włączona → ekran nowego
 * frontu w nowej ramce panelu uczestnika (`NowyEkran.tsx`). Dostęp rozstrzyga układ panelu.
 */
export default function StronaZacznijTutaj() {
  return GRUPY.zacznijTutaj.wlaczona ? <ZacznijTutajNowyEkran /> : <ZacznijTutajStaraTresc />;
}
