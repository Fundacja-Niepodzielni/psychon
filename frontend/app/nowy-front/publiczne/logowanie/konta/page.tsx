import Logo from "@/components/ui/Logo";
import { PrzekierowanieKont } from "@/nowy-front/logowanie/PrzekierowanieKont";

/**
 * Podgląd `/nowy-front/publiczne/logowanie/konta` — przekierowanie starego adresu na `/logowanie` w nowym wyglądzie. Stara strona: `app/logowanie/konta/page.tsx`
 * (bez zmian). Znak Fundacji dostarcza strona, tak jak powłoki paneli w
 * `app/(przelaczenie)`; ekran nowego frontu nie importuje `components/`.
 */
export default function Strona() {
  return <PrzekierowanieKont logo={<Logo title="Fundacja Niepodzielni" />} />;
}
