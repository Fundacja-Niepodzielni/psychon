import type { ReactNode } from "react";
import RequireRole from "@/components/permissions/RequireRole";

/**
 * Układ strony podglądu profilu psychologa pod `/nowy-front/profil-psychologa`:
 * strażnik roli dla strony podglądu. Dostęp ma wyłącznie `volunteer` — ta sama
 * rola co strażnik układu `/panel/profil-psychologa` — a rola spoza niej dostaje
 * wspólny ekran „Brak dostępu” zamiast formularza profilu. Przegląd
 * `lib/przelaczenie/__tests__/straznik-roli-grup.test.ts` pilnuje, żeby role
 * tego strażnika były równe rolom trasy produktu.
 */
export default function UkladPodgladuProfiluPsychologa({ children }: { children: ReactNode }) {
  return <RequireRole allowedRoles={["volunteer"]}>{children}</RequireRole>;
}
