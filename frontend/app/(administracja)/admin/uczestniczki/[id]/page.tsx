import type { Metadata } from "next";
import "@/design-system/tokeny/tokeny.css";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import { KartaOsoby } from "@/nowy-front/karta-osoby/KartaOsoby";
import StaraTresc from "./StaraTresc";

/**
 * Trasa `/admin/uczestniczki/[id]` — karta osoby w administracji (H18).
 * Adres się nie zmienia: strona czyta rejestr przełączenia
 * (`lib/przelaczenie/grupy.ts`, grupa `kartaOsoby`). Grupa wyłączona →
 * dotychczasowa treść (`StaraTresc.tsx`, przeniesiona bez zmiany; komponent
 * kliencki odpakowuje `params` przez `use()`); grupa włączona → karta nowego
 * frontu w powłoce panelu administracji. `params` to Promise (Next.js 16).
 * Przycisk „Przedłuż dostęp” pojawia się dopiero wraz z grupą przedłużenia
 * dostępu, więc strona nie przekazuje adresu przedłużenia. Tytuł karty przeglądarki
 * nie niesie imienia i nazwiska — dane osoby nie trafiają do tytułu.
 */
export const metadata: Metadata = GRUPY.kartaOsoby.wlaczona ? { title: "Karta osoby — Niepodzielni" } : {};

export default async function StronaKartyOsoby({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!GRUPY.kartaOsoby.wlaczona) return <StaraTresc params={Promise.resolve({ id })} />;

  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <KartaOsoby id={Number(id)} />
      </DostawcaPowloki>
    </div>
  );
}
