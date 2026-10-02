import { KursUczestnikaZAdresu } from "@/nowy-front/kurs-uczestnika/KursUczestnikaZAdresu";

/**
 * Trasa `/nowy-front/kurs-uczestnika/[slug]` — strona kursu uczestnika. Odczyt
 * kursu biegnie z przeglądarki (`KursUczestnika.tsx`), tak samo jak na
 * `/nowy-front/lekcja/[id]`. Tryb podglądu (`?podglad=1` i rola personelu albo
 * prowadzącego) rozstrzyga `KursUczestnikaZAdresu`, tak samo jak na trasie
 * produktu `/panel/kursy/[slug]`.
 */
export default async function StronaKursuUczestnika({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <KursUczestnikaZAdresu slug={slug} />;
}
