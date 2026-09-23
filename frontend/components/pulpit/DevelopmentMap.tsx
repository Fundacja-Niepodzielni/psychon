import Card from "@/components/ui/Card";
import type { CourseListItem } from "@/lib/courses";
import type { ParticipantSlot } from "@/lib/h12/types";
import StageNode from "./StageNode";
import SupervisionNode from "./SupervisionNode";
import type { Aux } from "./useDashboardData";

/** Sekcja „Mapa rozwoju" — etapy ścieżki + ewentualny węzeł superwizji. */
export default function DevelopmentMap({
  stages,
  slots,
}: {
  stages: CourseListItem[];
  slots: Aux<ParticipantSlot[]> | { status: "skipped" };
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-h3 font-bold text-ink">Mapa rozwoju</h2>
      <Card>
        {stages.length === 0 ? (
          <p className="text-body text-muted">
            Twoja ścieżka pojawi się tutaj, gdy opiekun udostępni pierwszy etap.
          </p>
        ) : (
          <ol className="flex flex-col">
            {stages.map((stage) => (
              <StageNode key={stage.id} course={stage} />
            ))}
            {slots.status !== "skipped" && <SupervisionNode slots={slots} />}
          </ol>
        )}
      </Card>
    </section>
  );
}
