import type { ReactNode } from "react";
import PanelShell from "@/components/layout/PanelShell";
import RequireRole from "@/components/permissions/RequireRole";
import { adminMenu, adminMenuSections } from "@/lib/menu/admin";
import { DostawcaPowloki } from "@/design-system/szablony/KontekstPowloki";

/**
 * Układ segmentu `/admin` w grupie tras `(przelaczenie)` — powłoka
 * administracji (menu boczne, nagłówek, link skoku, jedyny `main` pod
 * `id="tresc"`) wokół ekranu nowego frontu, wewnątrz tego samego strażnika
 * ról co stary układ administracji (`project_manager`, `super_admin`).
 * Rola spoza tej pary dostaje wspólny ekran 403 bez powłoki i bez menu.
 * `DostawcaPowloki` mówi szablonowi ekranu, że `main` niesie już powłoka.
 */
export default function UkladAdministracji({ children }: { children: ReactNode }) {
  return (
    <RequireRole allowedRoles={["project_manager", "super_admin"]}>
      <PanelShell
        panelName="Administracja"
        menu={adminMenu}
        sections={adminMenuSections}
        menuKey="admin"
      >
        <DostawcaPowloki>{children}</DostawcaPowloki>
      </PanelShell>
    </RequireRole>
  );
}
