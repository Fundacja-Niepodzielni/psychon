import PanelShell from "@/components/layout/PanelShell";
import RequireRole from "@/components/permissions/RequireRole";
import { adminMenu } from "@/lib/menu/admin";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireRole allowedRoles={["project_manager", "super_admin"]}>
      <PanelShell panelName="Administracja" menu={adminMenu}>
        {children}
      </PanelShell>
    </RequireRole>
  );
}
