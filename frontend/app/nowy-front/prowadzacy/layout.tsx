import type { ReactNode } from "react";
import RequireRole from "@/components/permissions/RequireRole";

/**
 * Układ stron podglądu prowadzącego pod `/nowy-front/prowadzacy` (pulpit,
 * kursy, skrzynka pytań i pytania testu): strażnik roli dla stron podglądu.
 * Dostęp ma wyłącznie `instructor` — ta sama rola co strażnik układu
 * `/prowadzacy` — a rola spoza niej dostaje wspólny ekran „Brak dostępu”
 * zamiast ekranu prowadzącego. Przegląd
 * `lib/przelaczenie/__tests__/straznik-roli-grup.test.ts` pilnuje, żeby żadna
 * strona pod tym adresem nie stała poza strażnikiem z rolami trasy produktu.
 */
export default function UkladPodgladuProwadzacego({ children }: { children: ReactNode }) {
  return <RequireRole allowedRoles={["instructor"]}>{children}</RequireRole>;
}
