import { KursAdministracji } from "@/nowy-front/kurs-administracji/KursAdministracji";

/**
 * Trasa `/nowy-front/admin/kursy/[id]` — ekran kursu administracji: tematy
 * i lekcje, publikacja, zaproszenia i usunięcie kursu na jednej stronie.
 * Odczyt i zapis biegną z przeglądarki, z tokenem sesji
 * (`KursAdministracji.tsx`); strona tylko przekazuje identyfikator z adresu.
 */
export default async function StronaKursuAdministracji({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <KursAdministracji idKursu={id} />;
}
