import { GRUPY } from "@/lib/przelaczenie/grupy";
import DokumentPrawnyNowyEkran from "./NowyEkran";
import DokumentPrawnyStaraTresc from "./StaraTresc";

/**
 * Trasa `/dokumenty-prawne/[typ]` — dokument prawny (regulamin, polityka prywatności, klauzula RODO).
 * Adres się nie zmienia: strona czyta rejestr przełączenia (`lib/przelaczenie/grupy.ts`, grupa
 * `dokumentyPubliczne`). Grupa wyłączona → dotychczasowa treść (`StaraTresc.tsx`, przeniesiona bez
 * zmiany, z tym samym `params`); grupa włączona → ekran nowego frontu (`NowyEkran.tsx`).
 */
export default function StronaDokumentuPrawnego({ params }: { params: Promise<{ typ: string }> }) {
  return GRUPY.dokumentyPubliczne.wlaczona ? (
    <DokumentPrawnyNowyEkran params={params} />
  ) : (
    <DokumentPrawnyStaraTresc params={params} />
  );
}
