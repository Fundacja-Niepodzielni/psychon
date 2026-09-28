import { auth } from "@/auth";
import { KursPublikacja } from "@/nowy-front/kurs-publikacja/KursPublikacja";
import { pobierzDaneKursu } from "@/nowy-front/kurs-publikacja/dane";

/**
 * Trasa robocza pod prefiksem nowego frontu (`01-SCIEZKI-UZYTKOWNIKOW.md`
 * nie nazywa ścieżki wariantu stałego O7; dopisek w tym pliku, nie cicha
 * nazwa). Montuje `PublishChecklist` (O7) na realnych danych kursu
 * z istniejącego API H08, obok `app/globals.css` starego frontu
 * (`app/layout.tsx`, niezmieniony).
 */
export default async function StronaKursuNowyFront({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sesja = await auth();
  const wynik = await pobierzDaneKursu(id, sesja?.accessToken ?? null);

  return <KursPublikacja idKursu={id} wynik={wynik} />;
}
