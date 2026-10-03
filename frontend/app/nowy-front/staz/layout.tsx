import type { ReactNode } from "react";
import RequireRole from "@/components/permissions/RequireRole";

/**
 * Układ strony podglądu dziennika stażu pod `/nowy-front/staz`: strażnik roli
 * dla strony podglądu. Dostęp ma wyłącznie `volunteer` — ta sama rola co
 * strażnik układu `/panel/staz` — a rola spoza niej dostaje wspólny ekran
 * „Brak dostępu” zamiast dziennika stażu. Przegląd
 * `lib/przelaczenie/__tests__/straznik-roli-grup.test.ts` pilnuje, żeby role
 * tego strażnika były równe rolom trasy produktu.
 */
export default function UkladPodgladuDziennikaStazu({ children }: { children: ReactNode }) {
  return <RequireRole allowedRoles={["volunteer"]}>{children}</RequireRole>;
}
