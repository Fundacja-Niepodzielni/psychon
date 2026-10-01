import type { Metadata } from "next";
import "@/design-system/tokeny/tokeny.css";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import { KursAdministracji } from "@/nowy-front/kurs-administracji/KursAdministracji";
import StaraTresc from "./StaraTresc";

/**
 * Trasa `/admin/kursy/[id]` — kurs w administracji. Adres się nie zmienia:
 * strona czyta rejestr przełączenia (`lib/przelaczenie/grupy.ts`, grupa
 * `kursAdministracji`). Grupa wyłączona → dotychczasowa treść
 * (`StaraTresc.tsx`, przeniesiona bez zmiany; komponent kliencki odpakowuje
 * `params` przez `use()`); grupa włączona → ekran kursu nowego frontu
 * (`frontend/nowy-front/kurs-administracji/`) w powłoce panelu administracji.
 * `params` to Promise (Next.js 16). Tytuł karty nie niesie tytułu kursu —
 * przy wyłączonej grupie strona nie ma własnego tytułu, jak dotąd.
 */
export const metadata: Metadata = GRUPY.kursAdministracji.wlaczona ? { title: "Kurs — Niepodzielni" } : {};

export default async function StronaKursu({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!GRUPY.kursAdministracji.wlaczona) return <StaraTresc params={Promise.resolve({ id })} />;

  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <KursAdministracji idKursu={id} />
      </DostawcaPowloki>
    </div>
  );
}
