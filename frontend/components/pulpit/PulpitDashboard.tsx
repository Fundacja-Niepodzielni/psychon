"use client";

import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import PageTemplate from "@/components/templates/PageTemplate";
import DevelopmentMap from "./DevelopmentMap";
import NextStepCard from "./NextStepCard";
import ProgressShortcuts from "./ProgressShortcuts";
import { useDashboardData } from "./useDashboardData";

export default function PulpitDashboard() {
  const {
    me,
    courses,
    basicsError,
    retry,
    slots,
    conditions,
    stages,
    inProgress,
    detail,
    nextStep,
  } = useDashboardData();

  if (basicsError !== null) {
    return (
      <PageTemplate naglowek={{ title: "Pulpit" }}>
        <div className="flex flex-col items-start gap-3">
          <Alert variant="error" title="Nie udało się wczytać pulpitu">
            {basicsError}
          </Alert>
          <Button variant="secondary" onClick={retry}>
            Spróbuj ponownie
          </Button>
        </div>
      </PageTemplate>
    );
  }

  if (me === null || courses === null) {
    return (
      <PageTemplate naglowek={{ title: "Pulpit" }}>
        <p role="status" className="text-body text-muted">
          Wczytywanie pulpitu…
        </p>
      </PageTemplate>
    );
  }

  const name = me.first_name.trim();

  return (
    <PageTemplate
      naglowek={{
        title: name ? `Dzień dobry, ${name}` : "Dzień dobry",
        description:
          "To Twoje miejsce na dziś. Bez pośpiechu — poniżej znajdziesz następny krok i podgląd całej ścieżki.",
        breadcrumbs: (
          <p className="text-caption font-medium uppercase tracking-[0.06em] text-subtle">
            Pulpit
          </p>
        ),
      }}
    >
      <div className="flex flex-col gap-10">
        <DevelopmentMap stages={stages} slots={slots} />

        <NextStepCard
          loading={inProgress !== null && (!detail || detail.status === "loading")}
          failed={inProgress !== null && detail?.status === "error"}
          inProgress={inProgress}
          step={nextStep}
        />

        <ProgressShortcuts
          stages={stages}
          inProgress={inProgress}
          conditions={conditions}
          isVolunteer={me.role === "volunteer"}
        />
      </div>
    </PageTemplate>
  );
}
