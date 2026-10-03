import "@/design-system/tokeny/tokeny.css";
import type { Metadata } from "next";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import { SuperwizjaUczestnika } from "@/nowy-front/superwizja-uczestnika/SuperwizjaUczestnika";
import StaraTresc from "./StaraTresc";

export const metadata: Metadata = {
  title: "Superwizja — Niepodzielni",
};

/**
 * Trasa `/panel/superwizja` — zapisy osoby wolontariackiej na terminy
 * superwizji (H12). Adres się nie zmienia: strona czyta rejestr przełączenia
 * (`lib/przelaczenie/grupy.ts`, grupa `superwizjaUczestnika`). Grupa wyłączona
 * → dotychczasowa treść (`StaraTresc.tsx`, przeniesiona bez zmiany); grupa
 * włączona → ekran nowego frontu w powłoce panelu uczestnika. Bramka roli
 * (`volunteer`) stoi w `layout.tsx` obok i obejmuje oba warianty. Tytuł karty
 * jest ten sam w obu stanach.
 */
export default function SupervisionPage() {
  if (!GRUPY.superwizjaUczestnika.wlaczona) return <StaraTresc />;

  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <SuperwizjaUczestnika />
      </DostawcaPowloki>
    </div>
  );
}
