import { GRUPY } from "@/lib/przelaczenie/grupy";
import CertyfikatNowyEkran from "./NowyEkran";
import CertyfikatStaraTresc from "./StaraTresc";

/**
 * Trasa `/certyfikat` — publiczna strona certyfikatu z adresu (`?token` albo `?number`). Adres się nie zmienia: strona czyta rejestr przełączenia
 * (`lib/przelaczenie/grupy.ts`, grupa `certyfikatPubliczny`). Grupa wyłączona → dotychczasowa treść
 * (`StaraTresc.tsx`, przeniesiona bez zmiany); grupa włączona → ekran nowego frontu
 * na szablonie strony publicznej (`NowyEkran.tsx`).
 */
export default function StronaCertyfikat() {
  return GRUPY.certyfikatPubliczny.wlaczona ? <CertyfikatNowyEkran /> : <CertyfikatStaraTresc />;
}
