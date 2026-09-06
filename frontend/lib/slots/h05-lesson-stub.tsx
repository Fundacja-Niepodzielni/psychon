import { formatDuration } from "@/lib/courses";
import type { CoursePageSlot, CoursePageSlotProps } from "./course-page";

/**
 * Zaślepka regionu „lesson": karta podsumowania lekcji z danych, które
 * `GET /courses/{slug}` już zwraca. Odtwarzacz, heartbeat i ukończenie lekcji
 * należą do H06 — ten slot znika, gdy H06 zarejestruje własny z niższym `order`.
 */
function LessonSummaryStub({ lesson }: CoursePageSlotProps) {
  if (!lesson) return null;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-body font-medium text-ink">{lesson.title}</p>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-subtle">
        <span>{formatDuration(lesson.duration_seconds)}</span>
        <span
          className={
            lesson.is_completed ? "font-bold text-success" : "text-subtle"
          }
        >
          {lesson.is_completed ? "Ukończona" : "Nieukończona"}
        </span>
      </p>
    </div>
  );
}

const slot: CoursePageSlot = {
  id: "h05-lesson-stub",
  region: "lesson",
  order: 900,
  Component: LessonSummaryStub,
};

export default slot;
