import Card from "@/components/ui/Card";
import Text from "@/components/ui/Text";

/**
 * Stan „program jeszcze nieukończony" ekranu `/panel/po-programie`.
 * Bez odnośników. `program_completed_at` samo w sobie o niczym nie
 * przesądza — H13 (`h13.php:26`) i H14 (`h14.php:21`) niosą
 * `access.active`, a `EnsureAccessActive.php:24-34` odmawia (403) dopiero
 * w koniunkcji: `program_completed_at === null` ORAZ wygasły
 * `access_expires_at`. Na tym ekranie pierwszy warunek jest zawsze
 * spełniony, więc o wyniku decyduje wyłącznie drugie pole: część osób
 * oglądających tę kartę dostałaby z tych tras 403, reszta (z jeszcze
 * ważnym dostępem) — nie.
 */
export default function ProgramPendingCard() {
  return (
    <Card title="Program w toku">
      <Text tone="muted">Ekran będzie dostępny po ukończeniu programu.</Text>
    </Card>
  );
}
