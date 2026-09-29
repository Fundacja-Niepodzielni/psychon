import { Lekcja } from "@/nowy-front/lekcja/Lekcja";

/**
 * Route `/nowy-front/lekcja/[id]` — lesson screen (H06). Read and
 * completion both run from the browser (`Lekcja.tsx`), same reason as
 * `/nowy-front/po-programie`.
 */
export default async function StronaLekcji({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Lekcja id={id} />;
}
