import PanelShell from "@/components/layout/PanelShell";
import { participantMenu } from "@/lib/menu/participant";

export default function ParticipantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PanelShell panelName="Panel uczestnika" menu={participantMenu}>
      {children}
    </PanelShell>
  );
}
