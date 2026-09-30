import type { Metadata } from "next";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import { WzoryDokumentow } from "@/nowy-front/wzory-dokumentow/WzoryDokumentow";
import StaraTresc from "./StaraTresc";

export const metadata: Metadata = {
  title: "Wzory dokumentów — Niepodzielni",
};

/**
 * Trasa `/admin/wzory-dokumentow` — ekran „Wzory dokumentów” (H14). Adres się
 * nie zmienia: strona czyta rejestr przełączenia (`lib/przelaczenie/grupy.ts`,
 * grupa `wzoryDokumentow`). Grupa wyłączona → dotychczasowa treść
 * (`StaraTresc.tsx`, trzy zakładki, przeniesiona bez zmiany); grupa włączona →
 * ekran nowego frontu w powłoce panelu administracji. Tytuł karty jest ten sam
 * w obu stanach.
 */
export default function StronaWzorowDokumentow() {
  if (!GRUPY.wzoryDokumentow.wlaczona) return <StaraTresc />;

  return (
    <DostawcaPowloki>
      <WzoryDokumentow />
    </DostawcaPowloki>
  );
}
