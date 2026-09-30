import { ZaproszeniaKursu } from "@/nowy-front/zaproszenia-kursu/ZaproszeniaKursu";

/**
 * Trasa `/nowy-front/admin/kursy/[id]/zaproszenia` — „Zaproszenia na kurs”
 * (`POST /admin/courses/{course}/invite`). Odczyt kursu i osób oraz zapis
 * biegną z przeglądarki (`ZaproszeniaKursu.tsx`).
 */
export default async function StronaZaproszenNaKurs({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ZaproszeniaKursu idKursu={id} />;
}
