import { KursUczestnika } from "@/nowy-front/kurs-uczestnika/KursUczestnika";

/**
 * Trasa `/nowy-front/kurs-uczestnika/[slug]` — strona kursu uczestnika. Odczyt
 * kursu biegnie z przeglądarki (`KursUczestnika.tsx`), tak samo jak na
 * `/nowy-front/lekcja/[id]`. Parametr `?podglad=1` włącza na poligonie pas
 * trybu podglądu, żeby dało się go obejrzeć i zmierzyć; trasa produktu
 * (`/panel/kursy/[slug]`) go nie czyta.
 */
export default async function StronaKursuUczestnika({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ podglad?: string | string[] }>;
}) {
  const { slug } = await params;
  const { podglad } = await searchParams;
  return <KursUczestnika slug={slug} podglad={podglad === "1"} />;
}
