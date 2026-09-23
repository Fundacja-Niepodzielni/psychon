import Link from "next/link";
import type { CourseListItem } from "@/lib/courses";
import type { NextStep } from "@/lib/pulpit/data";
import { CTA_CLASS } from "./styles";

/** Karta „Kolejny krok" — lekcja, test, certyfikat albo pusty stan. */
export default function NextStepCard({
  loading,
  failed,
  inProgress,
  step,
}: {
  loading: boolean;
  failed: boolean;
  inProgress: CourseListItem | null;
  step: NextStep | null;
}) {
  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-accent-15 bg-accent-06 p-6"
      aria-labelledby="pulpit-next-step"
    >
      <h2 id="pulpit-next-step" className="text-h4 font-bold text-accent">
        Kolejny krok
      </h2>

      {loading && (
        <p role="status" className="text-body text-muted">
          Ustalamy Twój następny krok…
        </p>
      )}

      {!loading && failed && inProgress && (
        <>
          <p className="text-body text-muted">
            Nie udało się wczytać następnego kroku. Możesz wrócić do bieżącego etapu.
          </p>
          <Link href={`/panel/kursy/${inProgress.slug}`} className={CTA_CLASS}>
            Otwórz etap: {inProgress.title}
          </Link>
        </>
      )}

      {!loading && !failed && step && <NextStepBody step={step} />}
    </section>
  );
}

function NextStepBody({ step }: { step: NextStep }) {
  if (step.kind === "lesson") {
    return (
      <>
        <p className="text-caption font-bold tracking-wide text-subtle">
          {step.courseTitle} · {step.progressPercent}%
        </p>
        <p className="text-body font-medium text-ink">{step.lessonTitle}</p>
        <Link href={`/panel/lekcje/${step.lessonId}`} className={CTA_CLASS}>
          Kontynuuj naukę
        </Link>
      </>
    );
  }

  if (step.kind === "test") {
    return (
      <>
        <p className="text-body">
          Masz za sobą wszystkie lekcje etapu „{step.courseTitle}”. Czas na test
          sprawdzający.
        </p>
        <Link href={`/panel/kursy/${step.slug}/test`} className={CTA_CLASS}>
          Przejdź do testu
        </Link>
      </>
    );
  }

  if (step.kind === "certificate") {
    return (
      <>
        <p className="text-body">
          Masz wszystkie etapy za sobą. Dobra robota.
        </p>
        <Link href="/panel/certyfikat" className={CTA_CLASS}>
          Zobacz warunki certyfikatu
        </Link>
      </>
    );
  }

  return (
    <p className="text-body text-muted">
      Gdy opiekun udostępni pierwszy etap, pojawi się tutaj Twój następny krok.
    </p>
  );
}
