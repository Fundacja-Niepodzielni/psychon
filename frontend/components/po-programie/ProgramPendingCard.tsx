import Card from "@/components/ui/Card";

/**
 * Stan „program jeszcze nieukończony" ekranu `/panel/po-programie`.
 * Bez odnośników — nic tu nie prowadzi do trasy, której serwer jeszcze nie
 * pozwoli otworzyć (`program_completed_at` warunkuje H13/H14 po stronie API).
 */
export default function ProgramPendingCard() {
  return (
    <Card title="Program w toku">
      <p className="text-body text-muted">
        Ekran będzie dostępny po ukończeniu programu.
      </p>
    </Card>
  );
}
