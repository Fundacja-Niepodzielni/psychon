import { ZgloszenieDecyzja } from "@/nowy-front/zgloszenie-decyzja/ZgloszenieDecyzja";

/**
 * Trasa `/nowy-front/admin/zgloszenia/[id]` — decyzja o zgłoszeniu rekrutacyjnym
 * (`Admin/ApplicationController`, `backend/routes/api/h03.php:33-35,37`). Odczyt
 * i zapis biegną z przeglądarki tokenem osoby (`ZgloszenieDecyzja.tsx`).
 */
export default async function StronaZgloszenia({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ZgloszenieDecyzja id={id} />;
}
