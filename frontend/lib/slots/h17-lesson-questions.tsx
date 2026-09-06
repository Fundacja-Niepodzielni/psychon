import LessonQuestions from "@/components/questions/LessonQuestions";
import type { CoursePageSlot, CoursePageSlotProps } from "./course-page";

/**
 * Pytania do prowadzącego przy lekcji (pakiet H17). Strona kursu należy do H05 —
 * H17 wchodzi wyłącznie tym slotem, bez edycji plików H05.
 */
function LessonQuestionsSlot({ lesson }: CoursePageSlotProps) {
  if (!lesson) return null;

  return <LessonQuestions lessonId={lesson.id} lessonTitle={lesson.title} />;
}

const slot: CoursePageSlot = {
  id: "h17-lesson-questions",
  region: "lesson-actions",
  order: 100,
  Component: LessonQuestionsSlot,
};

export default slot;
