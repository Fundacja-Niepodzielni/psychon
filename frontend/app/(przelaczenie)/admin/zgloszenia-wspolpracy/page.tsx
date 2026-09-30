import { notFound } from "next/navigation";
import RequireRole from "@/components/permissions/RequireRole";
import { GRUPY, czyNowaTrasaDostepna } from "@/lib/przelaczenie/grupy";
import { ZgloszeniaWspolpracy } from "@/nowy-front/zgloszenia-wspolpracy/ZgloszeniaWspolpracy";

/**
 * Trasa produktu `/admin/zgloszenia-wspolpracy` — nowa trasa grupy
 * przełączenia `wspolpraca` (`lib/przelaczenie/grupy.ts`), ekran
 * administracji. Bez starej trasy (funkcji dotąd w starym froncie nie było
 * — „Sprawy”, `/admin/sprawy`, to inny pakiet, H12). Ekran sam
 * (`ZgloszeniaWspolpracy.tsx`, `frontend/nowy-front/zgloszenia-wspolpracy/`)
 * jest niezmieniony wobec `/nowy-front/admin/zgloszenia-wspolpracy` — ta
 * strona tylko dokłada `RequireRole`, ten sam strażnik co
 * `(administracja)/admin/layout.tsx`. Dopóki grupa jest wyłączona, adres
 * odpowiada jak na bazie (404).
 */
export default function StronaZgloszeniaWspolpracyAdmin() {
  if (!czyNowaTrasaDostepna(GRUPY.wspolpraca)) notFound();

  return (
    <RequireRole
      allowedRoles={["project_manager", "super_admin"]}
      deniedMessage="Ta funkcja jest dostępna tylko dla administracji."
    >
      <ZgloszeniaWspolpracy />
    </RequireRole>
  );
}
