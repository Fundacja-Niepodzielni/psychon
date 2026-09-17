import Card from "@/components/ui/Card";
import Text from "@/components/ui/Text";

/**
 * Stan „program jeszcze nieukończony" ekranu `/panel/po-programie`.
 * Bez odnośników — nic tu nie prowadzi do trasy, której serwer jeszcze nie
 * pozwoli otworzyć (`program_completed_at` warunkuje H13/H14 po stronie API).
 */
export default function ProgramPendingCard() {
  return (
    <Card title="Program w toku">
      <Text tone="muted">Ekran będzie dostępny po ukończeniu programu.</Text>
    </Card>
  );
}
