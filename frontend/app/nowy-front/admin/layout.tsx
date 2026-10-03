import type { ReactNode } from "react";
import RequireRole from "@/components/permissions/RequireRole";

/**
 * Układ stron podglądu administracji pod `/nowy-front/admin`: strażnik roli
 * dla stron podglądu. Dostęp mają wyłącznie `project_manager` i `super_admin`
 * — te same role co strażnik układu `/admin` — a rola spoza tej pary
 * dostaje wspólny ekran „Brak dostępu” zamiast ekranu administracji.
 * Przegląd `lib/przelaczenie/__tests__/straznik-roli-grup.test.ts` pilnuje,
 * żeby żadna strona pod tym adresem nie stała poza strażnikiem.
 *
 * Strony podglądu uczestnika i prowadzącego (`/nowy-front/kurs`,
 * `/nowy-front/prowadzacy/…` itd.) leżą poza tym segmentem i tego układu nie
 * dziedziczą.
 */
export default function UkladPodgladuAdministracji({ children }: { children: ReactNode }) {
  return <RequireRole allowedRoles={["project_manager", "super_admin"]}>{children}</RequireRole>;
}
