"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ProgressBar from "@/components/ui/ProgressBar";
import { ApiError } from "@/lib/api";
import {
  COURSE_STATUS_BADGE,
  fetchCourse,
  fetchCourses,
  stageLabel,
  type CourseDetail,
  type CourseListItem,
  type CourseStatus,
} from "@/lib/courses";
import type { ParticipantSlot } from "@/lib/h12/types";
import {
  fetchCertificateConditions,
  fetchPulpitMe,
  fetchSupervisionSlots,
  fullDateTime,
  nextFutureSlot,
  pathStages,
  relativeTimeTo,
  resolveNextStep,
  type CertificateConditions,
  type NextStep,
  type PulpitMe,
} from "@/lib/pulpit/data";

/** Stan zapytania pomocniczego: ładowanie, sukces lub rzeczowa nota o awarii. */
type Aux<T> = { status: "loading" } | { status: "error" } | { status: "ok"; data: T };

const LINK_CLASS =
  "inline-flex min-h-11 items-center gap-2 self-start text-small font-medium " +
  "text-accent transition-colors duration-200 hover:text-accent-dark focus-visible:focus-ring";

const CTA_CLASS =
  "inline-flex min-h-11 items-center gap-2 self-start rounded-pill bg-primary px-6 py-2.5 " +
  "text-body font-medium text-light transition-colors duration-200 hover:bg-ink focus-visible:focus-ring";

export default function PulpitDashboard() {
  const [me, setMe] = useState<PulpitMe | null>(null);
  const [courses, setCourses] = useState<CourseListItem[] | null>(null);
  const [basicsError, setBasicsError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [slots, setSlots] = useState<Aux<ParticipantSlot[]>>({ status: "loading" });
  const [detail, setDetail] = useState<Aux<CourseDetail> | null>(null);
  const [conditions, setConditions] = useState<
    Aux<CertificateConditions> | { status: "skipped" }
  >({ status: "loading" });

  useEffect(() => {
    let active = true;

    Promise.all([fetchPulpitMe(), fetchCourses()])
      .then(([loadedMe, loadedCourses]) => {
        if (!active) return;
        setMe(loadedMe);
        setCourses(loadedCourses);

        fetchSupervisionSlots()
          .then((data) => active && setSlots({ status: "ok", data }))
          .catch(() => active && setSlots({ status: "error" }));

        const inProgress = pathStages(loadedCourses).find(
          (course) => course.status === "in_progress",
        );
        if (inProgress) {
          setDetail({ status: "loading" });
          fetchCourse(inProgress.slug)
            .then((data) => active && setDetail({ status: "ok", data }))
            .catch(() => active && setDetail({ status: "error" }));
        }

        if (loadedMe.role === "volunteer") {
          fetchCertificateConditions()
            .then((data) => active && setConditions({ status: "ok", data }))
            .catch(() => active && setConditions({ status: "error" }));
        } else {
          setConditions({ status: "skipped" });
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setBasicsError(
          err instanceof ApiError
            ? err.message
            : "Nie udało się połączyć z serwerem. Spróbuj ponownie.",
        );
      });

    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setMe(null);
    setCourses(null);
    setBasicsError(null);
    setSlots({ status: "loading" });
    setDetail(null);
    setConditions({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  const stages = useMemo(() => (courses ? pathStages(courses) : []), [courses]);
  const inProgress = useMemo(
    () => stages.find((course) => course.status === "in_progress") ?? null,
    [stages],
  );

  const nextStep = useMemo<NextStep | null>(() => {
    if (!courses) return null;
    if (inProgress) {
      if (!detail || detail.status === "loading") return null;
      if (detail.status === "error") return null;
      return resolveNextStep(courses, detail.data);
    }
    return resolveNextStep(courses, null);
  }, [courses, inProgress, detail]);

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
              <SupervisionNode slots={slots} />
            </ol>
          )}
        </Card>
      </section>

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

/* ------------------------------------------------------------------ */
/* Powitanie                                                          */
/* ------------------------------------------------------------------ */

function Greeting({ firstName }: { firstName: string }) {
  const name = firstName.trim();

  return (
    <header className="flex flex-col gap-2">
      <p className="text-caption font-medium uppercase tracking-[0.06em] text-subtle">
        Pulpit
      </p>
      <h1 className="text-h1 font-black text-ink">
        {name ? `Dzień dobry, ${name}` : "Dzień dobry"}
      </h1>
      <p className="max-w-2xl text-body text-muted">
        To Twoje miejsce na dziś. Bez pośpiechu — poniżej znajdziesz następny krok
        i podgląd całej ścieżki.
      </p>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Mapa rozwoju — węzły                                               */
/* ------------------------------------------------------------------ */

const NODE_TONE: Record<CourseStatus | "supervision", string> = {
  completed: "bg-success-bg text-success",
  in_progress: "bg-accent-15 text-accent",
  locked: "bg-grey text-subtle",
  supervision: "bg-info-bg text-info-dark",
};

function NodeShell({
  tone,
  icon,
  showConnector,
  children,
}: {
  tone: string;
  icon: ReactNode;
  showConnector: boolean;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <div className="flex flex-col items-center">
        <span
          aria-hidden="true"
          className={`flex size-9 shrink-0 items-center justify-center rounded-pill ${tone}`}
        >
          {icon}
        </span>
        {showConnector && (
          <span aria-hidden="true" className="mt-1 w-px flex-1 bg-line" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 pb-8">{children}</div>
    </li>
  );
}

function StageNode({ course }: { course: CourseListItem }) {
  const badge = COURSE_STATUS_BADGE[course.status];
  const locked = course.status === "locked";

  return (
    <NodeShell tone={NODE_TONE[course.status]} icon={statusIcon(course.status)} showConnector>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-caption font-bold tracking-wide text-subtle">
          {stageLabel(course.sequence_order)}
        </p>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      <h3 className="text-h4 font-bold text-ink">{course.title}</h3>

      <ProgressBar
        value={course.progress_percent}
        label={`Postęp etapu ${course.title}`}
        showValue
        className="max-w-md"
      />

      {locked ? (
        <p className="flex min-h-11 items-center gap-2 text-small text-muted">
          <LockIcon />
          Ukończ poprzedni etap, aby odblokować.
        </p>
      ) : (
        <Link href={`/panel/kursy/${course.slug}`} className={LINK_CLASS}>
          Otwórz etap
          <span className="sr-only">: {course.title}</span>
          <span aria-hidden="true">→</span>
        </Link>
      )}
    </NodeShell>
  );
}

function SupervisionNode({ slots }: { slots: Aux<ParticipantSlot[]> }) {
  const link = (
    <Link href="/panel/superwizja" className={LINK_CLASS}>
      Zobacz superwizje
      <span aria-hidden="true">→</span>
    </Link>
  );

  let body: ReactNode;
  if (slots.status === "loading") {
    body = (
      <p role="status" className="text-small text-muted">
        Wczytywanie terminów superwizji…
      </p>
    );
  } else if (slots.status === "error") {
    body = (
      <>
        <p className="text-small text-muted">
          Nie udało się wczytać terminów superwizji.
        </p>
        {link}
      </>
    );
  } else {
    const slot = nextFutureSlot(slots.data);
    body = slot ? (
      <>
        <p className="text-body font-medium text-ink">
          {relativeTimeTo(slot.starts_at)}
        </p>
        <p className="text-small text-muted">{fullDateTime(slot.starts_at)}</p>
        {link}
      </>
    ) : (
      <>
        <p className="text-small text-muted">
          Termin pierwszej superwizji pojawi się tutaj, gdy opiekun go zaplanuje.
        </p>
        {link}
      </>
    );
  }

  return (
    <NodeShell tone={NODE_TONE.supervision} icon={<CalendarIcon />} showConnector={false}>
      <p className="text-caption font-bold tracking-wide text-subtle">Superwizja 1:1</p>
      <h3 className="text-h4 font-bold text-ink">Pierwsze spotkanie z superwizorem</h3>
      {body}
    </NodeShell>
  );
}

/* ------------------------------------------------------------------ */
/* Karta „Kolejny krok"                                              */
/* ------------------------------------------------------------------ */

function NextStepCard({
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

/* ------------------------------------------------------------------ */
/* Skróty postępu — cztery kafle                                     */
/* ------------------------------------------------------------------ */

function ProgressShortcuts({
  stages,
  inProgress,
  conditions,
  isVolunteer,
}: {
  stages: CourseListItem[];
  inProgress: CourseListItem | null;
  conditions: Aux<CertificateConditions> | { status: "skipped" };
  isVolunteer: boolean;
}) {
  const completed = stages.filter((course) => course.status === "completed").length;

  const internship =
    conditions.status === "ok"
      ? conditions.data.conditions.find((c) => c.key === "internship")
      : undefined;
  const supervision =
    conditions.status === "ok"
      ? conditions.data.conditions.find((c) => c.key === "supervision")
      : undefined;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-h3 font-bold text-ink">Skróty postępu</h2>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Ukończone etapy"
          value={stages.length === 0 ? "—" : `${completed} / ${stages.length}`}
        />
        <StatTile
          label="Bieżący etap"
          value={inProgress ? `${inProgress.progress_percent}%` : "—"}
          caption={inProgress ? inProgress.title : "brak aktywnego etapu"}
        />

        {conditions.status === "ok" ? (
          <>
            <StatTile
              label="Godziny stażu"
              value={`${internship?.done ?? "0"} / ${internship?.required ?? "0"}`}
            />
            <StatTile
              label="Obecności na superwizjach"
              value={`${supervision?.done ?? "0"} / ${supervision?.required ?? "0"}`}
            />
          </>
        ) : conditions.status === "loading" ? (
          <>
            <StatTile label="Godziny stażu" value="…" />
            <StatTile label="Obecności na superwizjach" value="…" />
          </>
        ) : (
          <p className="col-span-2 flex items-center rounded-lg border border-line bg-card-warm p-6 text-small text-muted">
            {conditions.status === "error"
              ? "Nie udało się wczytać danych stażu i superwizji."
              : "Godziny stażu i obecności na superwizjach zobaczysz tutaj jako wolontariusz."}
          </p>
        )}
      </div>

      {isVolunteer && (
        <Link href="/panel/certyfikat" className={LINK_CLASS}>
          Zobacz warunki certyfikatu
          <span aria-hidden="true">→</span>
        </Link>
      )}
    </section>
  );
}

function StatTile({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-card p-6 shadow-card">
      <p className="text-caption font-bold uppercase tracking-[0.06em] text-subtle">
        {label}
      </p>
      <p className="text-h3 font-black text-ink">{value}</p>
      {caption && <p className="text-caption text-muted">{caption}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ikony                                                             */
/* ------------------------------------------------------------------ */

function iconProps(size = "size-5") {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: size,
    "aria-hidden": true,
  };
}

function statusIcon(status: CourseStatus): ReactNode {
  if (status === "completed") {
    return (
      <svg {...iconProps()}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  if (status === "in_progress") {
    return (
      <svg {...iconProps()}>
        <path d="m7 4 13 8-13 8V4z" />
      </svg>
    );
  }
  return <LockIcon />;
}

function LockIcon() {
  return (
    <svg {...iconProps("size-4 shrink-0")}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
