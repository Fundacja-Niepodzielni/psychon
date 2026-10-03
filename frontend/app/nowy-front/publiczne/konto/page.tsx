import Logo from "@/components/ui/Logo";
import { Konto } from "@/nowy-front/konto/Konto";

/**
 * Podgląd `/nowy-front/publiczne/konto` — ekran „Twoje konto” w nowym
 * wyglądzie. Stara strona: `app/konto/page.tsx` (bez zmian).
 */
export default function Strona() {
  return <Konto logo={<Logo title="Fundacja Niepodzielni" />} />;
}
