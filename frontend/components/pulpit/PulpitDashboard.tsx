"use client";

import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import DevelopmentMap from "./DevelopmentMap";
import Greeting from "./Greeting";
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
      <div className="flex flex-col items-start gap-3">
        <Alert variant="error" title="Nie udało się wczytać pulpitu">
          {basicsError}
        </Alert>
        <Button variant="secondary" onClick={retry}>
          Spróbuj ponownie
        </Button>
      </div>
    );
  }

  if (me === null || courses === null) {
    return (
      <p role="status" className="text-body text-muted">
        Wczytywanie pulpitu…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <Greeting firstName={me.first_name} />

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
  );
}
