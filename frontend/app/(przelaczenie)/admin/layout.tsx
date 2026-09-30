import type { ReactNode } from "react";
import RequireRole from "@/components/permissions/RequireRole";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";
import { PowlokaAdministracji } from "./PowlokaAdministracji";

/**
 * Układ segmentu `/admin` w grupie tras `(przelaczenie)` — nowa ramka panelu
 * administracji z makiety 2.0.4 (`PowlokaAdministracji`: menu boczne,
 * górny pasek, link skoku, jedyny `main` pod `id="tresc"`) wokół ekranu
 * nowego frontu, wewnątrz tego samego strażnika ról co stary układ
 * administracji (`project_manager`, `super_admin`). Rola spoza tej pary
 * dostaje wspólny ekran 403 bez powłoki i bez menu. `DostawcaPowloki` mówi
 * szablonowi ekranu, że `main` niesie już powłoka.
 */
export default function UkladAdministracji({ children }: { children: ReactNode }) {
  return (
    <RequireRole allowedRoles={["project_manager", "super_admin"]}>
      <PowlokaAdministracji>
        <DostawcaPowloki>{children}</DostawcaPowloki>
      </PowlokaAdministracji>
    </RequireRole>
  );
}
