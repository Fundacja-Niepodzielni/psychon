import { GRUPY } from "@/lib/przelaczenie/grupy";
import NiepowiazaneNowyEkran from "./NowyEkran";
import NiepowiazaneStaraTresc from "./StaraTresc";

/**
 * Trasa `/logowanie/niepowiazane` — konto Niepodzielni bez powiązanego konta platformy. Adres się nie zmienia: strona czyta rejestr przełączenia
 * (`lib/przelaczenie/grupy.ts`, grupa `logowanie`). Grupa wyłączona → dotychczasowa treść
 * (`StaraTresc.tsx`, przeniesiona bez zmiany); grupa włączona → ekran nowego frontu
 * na szablonie strony publicznej (`NowyEkran.tsx`).
 */
export default function StronaNiepowiazane() {
  return GRUPY.logowanie.wlaczona ? <NiepowiazaneNowyEkran /> : <NiepowiazaneStaraTresc />;
}
