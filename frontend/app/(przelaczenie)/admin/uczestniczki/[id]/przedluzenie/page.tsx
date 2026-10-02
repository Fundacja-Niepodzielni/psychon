import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GRUPY, czyNowaTrasaDostepna } from "@/lib/przelaczenie/grupy";
import { PrzedluzenieDostepu } from "@/nowy-front/przedluzenie-dostepu/PrzedluzenieDostepu";

export const metadata: Metadata = {
  title: "Przedłużenie dostępu — Niepodzielni",
};

/**
 * Trasa `/admin/uczestniczki/[id]/przedluzenie` — przedłużenie dostępu osoby
 * (H04). Starej trasy nie ma: do tej pory adres nie istniał. Strona leży
 * w grupie tras `(przelaczenie)`, która daje ramkę nowego frontu, i czyta
 * rejestr przełączenia (`lib/przelaczenie/grupy.ts`, grupa
 * `przedluzenieDostepu`): grupa wyłączona → 404 jak dotąd, włączona → ekran
 * przedłużenia. Segment `[id]` to identyfikator osoby.
 */
export default async function StronaPrzedluzeniaDostepu({ params }: { params: Promise<{ id: string }> }) {
  if (!czyNowaTrasaDostepna(GRUPY.przedluzenieDostepu)) notFound();

  const { id } = await params;

  return <PrzedluzenieDostepu idOsoby={id} />;
}
