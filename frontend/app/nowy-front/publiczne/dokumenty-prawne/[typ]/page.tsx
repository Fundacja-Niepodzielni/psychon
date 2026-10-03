import Logo from "@/components/ui/Logo";
import { DokumentPrawny } from "@/nowy-front/dokumenty-publiczne/DokumentPrawny";

/**
 * Podgląd `/nowy-front/publiczne/dokumenty-prawne/[typ]` — dokument prawny w
 * nowym wyglądzie. Stara strona: `app/dokumenty-prawne/[typ]/page.tsx` (bez
 * zmian). `params` przychodzi jako obietnica (konwencja Next 16).
 */
export default async function Strona({ params }: { params: Promise<{ typ: string }> }) {
  const { typ } = await params;
  return <DokumentPrawny typ={typ} logo={<Logo title="Fundacja Niepodzielni" />} />;
}
