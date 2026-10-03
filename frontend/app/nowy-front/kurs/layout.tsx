import type { ReactNode } from "react";
import RequireRole from "@/components/permissions/RequireRole";

/**
 * Układ strony podglądu kursu prowadzącego pod `/nowy-front/kurs` (ekran kursu
 * i, z parametrem `lekcja`, strona lekcji): strażnik roli dla strony podglądu.
 * Dostęp ma wyłącznie `instructor` — ta sama rola co strażnik układu
 * `/prowadzacy/kursy/[id]` i strony lekcji `/prowadzacy/kursy/[id]/lekcje/[idLekcji]`
 * — a rola spoza niej dostaje wspólny ekran „Brak dostępu” zamiast ekranu kursu.
 * Przegląd `lib/przelaczenie/__tests__/straznik-roli-grup.test.ts` pilnuje, żeby
 * role tego strażnika były równe rolom trasy produktu.
 */
export default function UkladPodgladuKursuProwadzacego({ children }: { children: ReactNode }) {
  return <RequireRole allowedRoles={["instructor"]}>{children}</RequireRole>;
}
