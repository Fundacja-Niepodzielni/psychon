import type { Metadata } from "next";
import Logo from "@/components/ui/Logo";
import { DostepWygasl } from "@/nowy-front/dostep-wygasl/DostepWygasl";

export const metadata: Metadata = {
  title: "Dostęp wygasł — Niepodzielni",
};

/**
 * Podgląd `/nowy-front/publiczne/dostep-wygasl` — ekran wygasłego dostępu w
 * nowym wyglądzie. Stara strona: `app/dostep-wygasl/page.tsx` (bez zmian).
 */
export default function Strona() {
  return <DostepWygasl logo={<Logo title="Fundacja Niepodzielni" />} />;
}
