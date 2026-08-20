import PanelShell from "@/components/layout/PanelShell";
import { adminMenu } from "@/lib/menu/admin";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PanelShell panelName="Administracja" menu={adminMenu}>
      {children}
    </PanelShell>
  );
}
