import { TestUczestnikaZAdresu } from "@/nowy-front/test-uczestnika/TestUczestnikaZAdresu";

/**
 * Trasa `/nowy-front/kurs-uczestnika/[slug]/test` — test końcowy kursu w nowym
 * wyglądzie. Odczyt testu i wysłanie podejścia biegną z przeglądarki
 * (`TestUczestnika.tsx`), tak samo jak na `/nowy-front/kurs-uczestnika/[slug]`.
 * Tryb podglądu (`?podglad=1` i rola personelu albo prowadzącego) rozstrzyga
 * `TestUczestnikaZAdresu`.
 */
export default async function StronaTestuUczestnika({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <TestUczestnikaZAdresu slug={slug} />;
}
