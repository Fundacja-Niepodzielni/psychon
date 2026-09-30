import { PublikacjaKursu } from "@/nowy-front/publikacja-kursu/PublikacjaKursu";

/**
 * Trasa `/nowy-front/admin/kursy/[id]/publikacja` — publikacja kursu
 * (administracja, `GET`/`PATCH`/`DELETE /admin/courses/{id}`). Kurs i zapis
 * biegną z przeglądarki, z tokenem sesji (`PublikacjaKursu.tsx`); strona
 * tylko przekazuje identyfikator z adresu.
 */
export default async function StronaPublikacjiKursu({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <PublikacjaKursu idKursu={id} />;
}
