import type { Metadata } from "next";
import Logo from "@/components/ui/Logo";
import { DeklaracjaDostepnosci } from "@/nowy-front/dokumenty-publiczne/DeklaracjaDostepnosci";

export const metadata: Metadata = {
  title: "Deklaracja dostępności — Niepodzielni",
};

/**
 * Podgląd `/nowy-front/publiczne/deklaracja-dostepnosci` — deklaracja dostępności
 * w nowym wyglądzie. Stara strona: `app/deklaracja-dostepnosci/page.tsx` (bez zmian).
 */
export default function Strona() {
  return <DeklaracjaDostepnosci logo={<Logo title="Fundacja Niepodzielni" />} />;
}
