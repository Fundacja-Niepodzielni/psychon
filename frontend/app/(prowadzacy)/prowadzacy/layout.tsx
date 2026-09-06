import PanelShell from "@/components/layout/PanelShell";
import RequireRole from "@/components/permissions/RequireRole";
import { instructorMenu } from "@/lib/menu/instructor";

export default function InstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireRole allowedRoles={["instructor"]}>
      <PanelShell panelName="Panel prowadzącego" menu={instructorMenu}>
        {children}
      </PanelShell>
    </RequireRole>
  );
}
