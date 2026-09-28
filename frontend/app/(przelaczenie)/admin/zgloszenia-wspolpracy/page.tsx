import RequireRole from "@/components/permissions/RequireRole";
import { ZgloszeniaWspolpracy } from "@/nowy-front/zgloszenia-wspolpracy/ZgloszeniaWspolpracy";

/**
 * Trasa produktu `/admin/zgloszenia-wspolpracy` — nowa trasa grupy
 * przełączenia `wspolpraca` (`lib/przelaczenie/grupy.ts`), ekran
 * administracji. Bez starej trasy (funkcji dotąd w starym froncie nie było
 * — „Sprawy”, `/admin/sprawy`, to inny pakiet, H12). Ekran sam
 * (`ZgloszeniaWspolpracy.tsx`, `frontend/nowy-front/zgloszenia-wspolpracy/`)
 * jest niezmieniony wobec `/nowy-front/admin/zgloszenia-wspolpracy` — ta
 * strona tylko dokłada `RequireRole`, ten sam strażnik co
 * `(administracja)/admin/layout.tsx`.
 */
export default function StronaZgloszeniaWspolpracyAdmin() {
  return (
    <RequireRole
      allowedRoles={["project_manager", "super_admin"]}
      deniedMessage="Ta funkcja jest dostępna tylko dla administracji."
    >
      <ZgloszeniaWspolpracy />
    </RequireRole>
  );
}
