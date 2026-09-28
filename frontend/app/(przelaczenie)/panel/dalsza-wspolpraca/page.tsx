import RequireRole from "@/components/permissions/RequireRole";
import { PoProgramieWspolpraca } from "@/nowy-front/po-programie-wspolpraca/PoProgramieWspolpraca";

/**
 * Trasa produktu `/panel/dalsza-wspolpraca` — nowa trasa grupy przełączenia
 * `wspolpraca` (`lib/przelaczenie/grupy.ts`), ekran uczestnika. Ekran sam
 * (`PoProgramieWspolpraca.tsx`, `frontend/nowy-front/po-programie-wspolpraca/`)
 * jest niezmieniony wobec `/nowy-front/po-programie` — ta strona tylko
 * dokłada `RequireRole`, ten sam strażnik co stare trasy panelu uczestnika
 * (H01/H11/…: `role:volunteer,student` po stronie backendu, `GET /me`).
 */
export default function StronaDalszaWspolpraca() {
  return (
    <RequireRole
      allowedRoles={["volunteer", "student"]}
      deniedMessage="Ta funkcja jest dostępna dla wolontariuszek i studentek."
    >
      <PoProgramieWspolpraca />
    </RequireRole>
  );
}
