import Link from "next/link";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import ProgressBar from "@/components/ui/ProgressBar";
import {
  COURSE_STATUS_BADGE,
  stageLabel,
  type CourseListItem,
} from "@/lib/courses";

export interface CourseCardProps {
  course: CourseListItem;
}

/** Kafelek katalogu. Kurs zablokowany celowo nie jest linkiem. */
export default function CourseCard({ course }: CourseCardProps) {
  const badge = COURSE_STATUS_BADGE[course.status];
  const locked = course.status === "locked";

  return (
    <Card className="flex h-full w-full flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-caption font-bold tracking-wide text-subtle">
          {stageLabel(course.sequence_order)}
        </p>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      <h2 className="text-h4 font-bold text-ink">{course.title}</h2>

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <ProgressBar
          value={course.progress_percent}
          label={`Postęp kursu ${course.title}`}
          showValue
        />

        {locked ? (
          <p className="flex min-h-11 items-center gap-2 text-small text-muted">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4 shrink-0"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Ukończ poprzedni etap, aby odblokować.
          </p>
        ) : (
          <Link
            href={`/panel/kursy/${course.slug}`}
            className="inline-flex min-h-11 items-center gap-2 self-start rounded-pill text-small font-medium text-accent transition-colors duration-200 hover:text-accent-dark focus-visible:focus-ring"
          >
            {course.status === "completed" ? "Zobacz kurs" : "Kontynuuj kurs"}
            <span className="sr-only">: {course.title}</span>
            <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
    </Card>
  );
}
