import { PrzedluzenieDostepu } from "@/nowy-front/przedluzenie-dostepu/PrzedluzenieDostepu";

/**
 * Trasa `/nowy-front/admin/uczestniczki/[id]/przedluzenie` — przedłużenie
 * dostępu osoby jednym działaniem. Segment `[id]` to identyfikator osoby
 * z karty, pod którą ta trasa leży; dane czyta ekran z przeglądarki, tokenem
 * sesji (`PrzedluzenieDostepu.tsx`).
 */
export default async function StronaPrzedluzeniaDostepu({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <PrzedluzenieDostepu idOsoby={id} />;
}
