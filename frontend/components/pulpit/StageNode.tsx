import Link from "next/link";
import Badge from "@/components/ui/Badge";
import ProgressBar from "@/components/ui/ProgressBar";
import { COURSE_STATUS_BADGE, stageLabel, type CourseListItem } from "@/lib/courses";
import { LockIcon, statusIcon } from "./icons";
import { NODE_TONE, NodeShell } from "./NodeShell";
import { LINK_CLASS } from "./styles";

/** Węzeł mapy rozwoju dla pojedynczego etapu (kursu). */
export default function StageNode({ course }: { course: CourseListItem }) {
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
