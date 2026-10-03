import Logo from "@/components/ui/Logo";
import { Weryfikacja } from "@/nowy-front/certyfikat-publiczny/Weryfikacja";

/**
 * Podgląd `/nowy-front/publiczne/weryfikacja` — wyszukiwarka weryfikacji
 * certyfikatu w nowym wyglądzie. Stara strona: `app/weryfikacja/page.tsx` (bez zmian).
 */
export default function Strona() {
  return <Weryfikacja logo={<Logo title="Fundacja Niepodzielni" />} />;
}
