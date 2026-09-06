import type { CourseDetail, LessonSummary } from "@/lib/courses";
import { primarySlotForRegion, slotsForRegion } from "@/lib/slots/course-page";

export interface LessonRowProps {
  course: CourseDetail;
  lesson: LessonSummary;
}

/**
 * Wiersz lekcji: numer plus treść delegowana do rejestru slotów.
 * H05 wypełnia region „lesson" zaślepką podsumowania, H06 ją zastąpi.
 */
export default function LessonRow({ course, lesson }: LessonRowProps) {
  const Body = primarySlotForRegion("lesson")?.Component;
  const actions = slotsForRegion("lesson-actions");

  return (
    <li className="flex flex-col gap-3 border-b border-line py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-grey text-caption font-bold text-muted"
        >
          {lesson.sequence_order}
        </span>
        <div className="min-w-0">
          {Body ? (
            <Body course={course} lesson={lesson} />
          ) : (
            <p className="text-body font-medium text-ink">{lesson.title}</p>
          )}
        </div>
      </div>

      {actions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {actions.map(({ id, Component }) => (
            <Component key={id} course={course} lesson={lesson} />
          ))}
        </div>
      )}
    </li>
  );
}
