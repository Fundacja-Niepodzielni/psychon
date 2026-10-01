import "@/design-system/tokeny/tokeny.css";
import type { Metadata } from "next";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import { StazKolejka } from "@/nowy-front/staz-kolejka/StazKolejka";
import StaraTresc from "./StaraTresc";

export const metadata: Metadata = {
  title: "Akceptacja stażu — Niepodzielni",
};

/**
 * Trasa `/admin/staz` — decyzje o wpisach stażu czekających na akceptację
 * (H11). Adres się nie zmienia: strona czyta rejestr przełączenia
 * (`lib/przelaczenie/grupy.ts`, grupa `kolejkaStazu`). Grupa wyłączona →
 * dotychczasowa treść (`StaraTresc.tsx`, przeniesiona bez zmiany); grupa
 * włączona → ekran nowego frontu w powłoce panelu administracji. Tytuł karty
 * jest ten sam w obu stanach.
 */
export default function AdminInternshipPage() {
  if (!GRUPY.kolejkaStazu.wlaczona) return <StaraTresc />;

  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <StazKolejka />
      </DostawcaPowloki>
    </div>
  );
}
