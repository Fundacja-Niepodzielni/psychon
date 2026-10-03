import Logo from "@/components/ui/Logo";
import { Zablokowane } from "@/nowy-front/logowanie/Zablokowane";

/**
 * Podgląd `/nowy-front/publiczne/logowanie/zablokowane` — ekran konta zablokowanego w nowym wyglądzie. Stara strona: `app/logowanie/zablokowane/page.tsx`
 * (bez zmian). Znak Fundacji dostarcza strona, tak jak powłoki paneli w
 * `app/(przelaczenie)`; ekran nowego frontu nie importuje `components/`.
 */
export default function Strona() {
  return <Zablokowane logo={<Logo title="Fundacja Niepodzielni" />} />;
}
