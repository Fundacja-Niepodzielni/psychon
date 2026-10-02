import "@/design-system/tokeny/tokeny.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { GRUPY } from "@/lib/przelaczenie/grupy";
import { PrzedluzenieDostepu } from "@/nowy-front/przedluzenie-dostepu/PrzedluzenieDostepu";

/** Tytuł karty tylko przy włączonej grupie; przy wyłączonej adres nie istnieje. */
export const metadata: Metadata = GRUPY.przedluzenieDostepu.wlaczona
  ? { title: "Przedłużenie dostępu — Niepodzielni" }
  : {};

/**
 * Trasa `/admin/uczestniczki/[id]/przedluzenie` — przedłużenie dostępu osoby
 * (H04). Strona czyta rejestr przełączenia (`lib/przelaczenie/grupy.ts`,
 * grupa `przedluzenieDostepu`). Grupa wyłączona → adres zachowuje się jak
 * dotąd, czyli nie istnieje (404); grupa włączona → ekran nowego frontu
 * w powłoce panelu administracji. Segment `[id]` to identyfikator osoby.
 */
export default async function AdminExtendAccessPage({ params }: { params: Promise<{ id: string }> }) {
  if (!GRUPY.przedluzenieDostepu.wlaczona) notFound();

  const { id } = await params;

  return (
    <div data-theme="light">
      <DostawcaPowloki>
        <PrzedluzenieDostepu idOsoby={id} />
      </DostawcaPowloki>
    </div>
  );
}
