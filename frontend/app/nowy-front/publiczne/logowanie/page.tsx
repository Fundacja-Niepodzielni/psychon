import Logo from "@/components/ui/Logo";
import { Logowanie } from "@/nowy-front/logowanie/Logowanie";

/**
 * Podgląd `/nowy-front/publiczne/logowanie` — ekran logowania w nowym wyglądzie. Stara strona: `app/logowanie/page.tsx`
 * (bez zmian). Znak Fundacji dostarcza strona, tak jak powłoki paneli w
 * `app/(przelaczenie)`; ekran nowego frontu nie importuje `components/`.
 */
export default function Strona() {
  return <Logowanie logo={<Logo title="Fundacja Niepodzielni" />} />;
}
