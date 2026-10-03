import { PytaniaTestu } from "@/nowy-front/pytania-testu/PytaniaTestu";

/**
 * Trasa `/nowy-front/prowadzacy/testy/[id]/pytania` — pytania testu końcowego
 * w panelu prowadzącego: ten sam ekran i te same żądania co w panelu
 * administracji. `id` to numer testu (tak adresują go trasy serwera).
 * Odczyt i zapis biegną z przeglądarki (`PytaniaTestu.tsx`); strona przekazuje
 * numer testu i opcjonalny numer kursu z parametru `kurs` (okruszek do kursu).
 */
export default async function StronaPytanTestuProwadzacego({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kurs?: string | string[] }>;
}) {
  const { id } = await params;
  const { kurs } = await searchParams;

  return <PytaniaTestu idTestu={id} panel="prowadzacy" idKursu={typeof kurs === "string" ? kurs : null} />;
}
