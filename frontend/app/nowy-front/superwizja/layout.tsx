import type { ReactNode } from "react";
import RequireRole from "@/components/permissions/RequireRole";

/**
 * Układ strony podglądu superwizji pod `/nowy-front/superwizja`: strażnik roli
 * dla strony podglądu. Dostęp ma wyłącznie `volunteer` — ta sama rola co
 * strażnik układu `/panel/superwizja` — a rola spoza niej dostaje wspólny ekran
 * „Brak dostępu” zamiast zapisów na terminy superwizji. Przegląd
 * `lib/przelaczenie/__tests__/straznik-roli-grup.test.ts` pilnuje, żeby role
 * tego strażnika były równe rolom trasy produktu.
 */
export default function UkladPodgladuSuperwizji({ children }: { children: ReactNode }) {
  return <RequireRole allowedRoles={["volunteer"]}>{children}</RequireRole>;
}
