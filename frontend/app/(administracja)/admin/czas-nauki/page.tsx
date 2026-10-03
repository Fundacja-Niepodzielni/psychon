import "@/design-system/tokeny/tokeny.css";
import type { Metadata } from "next";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import { CzasNauki } from "@/nowy-front/czas-nauki/CzasNauki";
import StaraTresc from "./StaraTresc";

export const metadata: Metadata = {
  title: "Czas nauki — Niepodzielni",
};

/**
 * Trasa `/admin/czas-nauki` — czas nauki i rzetelność osób (H07). Adres się
 * nie zmienia: strona czyta rejestr przełączenia (`lib/przelaczenie/grupy.ts`,
 * grupa `czasNauki`). Grupa wyłączona → dotychczasowa treść (`StaraTresc.tsx`,
 * przeniesiona bez zmiany); grupa włączona → ekran nowego frontu w powłoce
 * panelu administracji, z widokiem osoby pod `?osoba=<numer>` na tej samej
 * stronie. Tytuł karty jest ten sam w obu stanach.
 */
export default function LearningTimePage() {
  if (!GRUPY.czasNauki.wlaczona) return <StaraTresc />;

  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <CzasNauki />
      </DostawcaPowloki>
    </div>
  );
}
