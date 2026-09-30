import { auth } from "@/auth";
import { KursTematy } from "@/nowy-front/kurs-tematy/KursTematy";
import { pobierzDaneKursu } from "@/nowy-front/kurs-publikacja/dane";

/**
 * Trasa robocza pod prefiksem nowego frontu — ekran A-12 „Kurs: tematy
 * i lekcje” na szablonie `DetailTemplate`. Dane kursu i lekcji czyta ten sam
 * `pobierzDaneKursu` co dotąd (istniejące API H08, trasy prowadzącego); panel
 * braków O7 liczy ta sama `checklistaPublikacji`, teraz jako `checklist`
 * szablonu, otwierany akcją główną „Opublikuj kurs”.
 */
export default async function StronaKursuNowyFront({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sesja = await auth();
  const wynik = await pobierzDaneKursu(id, sesja?.accessToken ?? null);

  return <KursTematy idKursu={id} wynik={wynik} />;
}
