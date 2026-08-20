import PanelShell from "@/components/layout/PanelShell";
import { instructorMenu } from "@/lib/menu/instructor";

export default function InstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PanelShell panelName="Panel prowadzącego" menu={instructorMenu}>
      {children}
    </PanelShell>
  );
}
