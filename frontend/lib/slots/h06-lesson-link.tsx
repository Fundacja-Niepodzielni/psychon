import Link from "next/link";

import type { CoursePageSlot, CoursePageSlotProps } from "./course-page";
import { formatDuration } from "@/lib/courses";

/**
 * Link from the H05 lesson list to the H06 lesson player screen.
 * The course page stays owned by H05; H06 only replaces the lesson slot.
 */
function LessonLink({ lesson }: CoursePageSlotProps) {
  if (!lesson) return null;

  return (
    <Link
      href={`/panel/lekcje/${lesson.id}`}
      aria-label={`Otwórz lekcję: ${lesson.title}`}
      className="group flex min-h-11 flex-col justify-center gap-1 rounded-md px-2 py-1 transition-colors duration-200 hover:bg-grey focus-visible:focus-ring"
    >
      <p className="text-body font-medium text-ink group-hover:text-primary">
        {lesson.title}
      </p>
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
    </Link>
  );
}

const slot: CoursePageSlot = {
  id: "h06-lesson-link",
  region: "lesson",
  order: 100,
  Component: LessonLink,
};

export default slot;
