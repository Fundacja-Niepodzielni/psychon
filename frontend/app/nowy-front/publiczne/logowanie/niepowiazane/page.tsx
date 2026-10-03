import Logo from "@/components/ui/Logo";
import { Niepowiazane } from "@/nowy-front/logowanie/Niepowiazane";

/**
 * Podgląd `/nowy-front/publiczne/logowanie/niepowiazane` — ekran konta niepowiązanego w nowym wyglądzie. Stara strona: `app/logowanie/niepowiazane/page.tsx`
 * (bez zmian). Znak Fundacji dostarcza strona, tak jak powłoki paneli w
 * `app/(przelaczenie)`; ekran nowego frontu nie importuje `components/`.
 */
export default function Strona() {
  return <Niepowiazane logo={<Logo title="Fundacja Niepodzielni" />} />;
}
