import Card from "@/components/ui/Card";
import Text from "@/components/ui/Text";

/**
 * Stan „program jeszcze nieukończony" ekranu `/panel/po-programie`.
 * Bez odnośników — ale nie dlatego, że `program_completed_at` warunkuje
 * dostęp do H13/H14 po stronie API: `EnsureAccessActive` czyta to pole
 * odwrotnie, jako zwolnienie z wygaśnięcia dostępu, a warunki certyfikatu
 * (`CertificateConditions`) i dokumentów (`DocumentTypeGate`) sprawdzają
 * odrębny postęp, nie ten znacznik. Backend w tym drzewie nie blokuje tych
 * tras samym brakiem ukończenia programu — brak odnośników tutaj nie ma
 * więc oparcia w bramkach API i jest wyłącznie decyzją interfejsu.
 */
export default function ProgramPendingCard() {
  return (
    <Card title="Program w toku">
      <Text tone="muted">Ekran będzie dostępny po ukończeniu programu.</Text>
    </Card>
  );
}
