"use client";

import { use } from "react";
import { KartaOsoby } from "@/nowy-front/karta-osoby/KartaOsoby";

/**
 * Trasa `/nowy-front/admin/uczestniczki/[id]` — ekran A-07 „Karta osoby"
 * (H18, administracja). Zastępuje stary
 * `app/(administracja)/admin/uczestniczki/[id]/page.tsx`
 * (`components/h18/AdminUserCard`, ZAMROŻONY, tylko czytany jako punkt
 * odniesienia) — przełączenia starej trasy na nową ten pakiet NIE wykonuje
 * (mechanizm 433, poza zakresem).
 */
export default function StronaKartyOsoby({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <KartaOsoby id={Number(id)} adresPrzedluzenia={`/nowy-front/admin/uczestniczki/${id}/przedluzenie`} />;
}
