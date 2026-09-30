import { notFound } from "next/navigation";
import RequireRole from "@/components/permissions/RequireRole";
import { GRUPY, czyNowaTrasaDostepna } from "@/lib/przelaczenie/grupy";
import { PoProgramieWspolpraca } from "@/nowy-front/po-programie-wspolpraca/PoProgramieWspolpraca";

/**
 * Trasa produktu `/panel/dalsza-wspolpraca` — nowa trasa grupy przełączenia
 * `wspolpraca` (`lib/przelaczenie/grupy.ts`), ekran uczestnika. Ekran sam
 * (`PoProgramieWspolpraca.tsx`, `frontend/nowy-front/po-programie-wspolpraca/`)
 * jest niezmieniony wobec `/nowy-front/po-programie` — ta strona tylko
 * dokłada `RequireRole`, ten sam strażnik co stare trasy panelu uczestnika
 * (H01/H11/…: `role:volunteer,student` po stronie backendu, `GET /me`).
 * Dopóki grupa jest wyłączona, adres odpowiada jak na bazie (404).
 */
export default function StronaDalszaWspolpraca() {
  if (!czyNowaTrasaDostepna(GRUPY.wspolpraca)) notFound();

  return (
    <RequireRole
      allowedRoles={["volunteer", "student"]}
      deniedMessage="Ta funkcja jest dostępna dla wolontariuszek i studentek."
    >
      <PoProgramieWspolpraca />
    </RequireRole>
  );
}
