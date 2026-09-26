import Card from "@/components/ui/Card";
import Text from "@/components/ui/Text";

/**
 * Stan „program jeszcze nieukończony" ekranu `/panel/po-programie`.
 * Bez odnośników. H14 (`h14.php`) wymaga
 * `['auth:keycloak', 'access.active']`; H13 (`h13.php`) tego samego plus
 * `role:volunteer`.
 */
export default function ProgramPendingCard() {
  return (
    <Card title="Program w toku">
      <Text tone="muted">Ekran będzie dostępny po ukończeniu programu.</Text>
    </Card>
  );
}
