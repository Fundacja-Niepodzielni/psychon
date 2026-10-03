import Logo from "@/components/ui/Logo";
import { Aktywacja } from "@/nowy-front/aktywacja/Aktywacja";

/**
 * Podgląd `/nowy-front/publiczne/aktywacja` — aktywacja konta w nowym
 * wyglądzie. Stara strona: `app/aktywacja/page.tsx` (bez zmian). Znak Fundacji
 * dostarcza strona, tak jak powłoki paneli w `app/(przelaczenie)`.
 */
export default function Strona() {
  return <Aktywacja logo={<Logo title="Fundacja Niepodzielni" />} />;
}
