import type { Metadata } from "next";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import DostepWygaslNowyEkran from "./NowyEkran";
import DostepWygaslStaraTresc from "./StaraTresc";

export const metadata: Metadata = {
  title: "Dostęp wygasł — Niepodzielni",
};

/**
 * Trasa `/dostep-wygasl` — komunikat o wygasłym dostępie. Adres się nie zmienia: strona czyta rejestr przełączenia
 * (`lib/przelaczenie/grupy.ts`, grupa `dostepWygasl`). Grupa wyłączona → dotychczasowa treść
 * (`StaraTresc.tsx`, przeniesiona bez zmiany); grupa włączona → ekran nowego frontu
 * na szablonie strony publicznej (`NowyEkran.tsx`).
 */
export default function StronaDostepWygasl() {
  return GRUPY.dostepWygasl.wlaczona ? <DostepWygaslNowyEkran /> : <DostepWygaslStaraTresc />;
}
