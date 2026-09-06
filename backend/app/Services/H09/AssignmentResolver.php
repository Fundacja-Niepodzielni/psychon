<?php

namespace App\Services\H09;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\Lesson;
use App\Models\User;

/**
 * H09 · jedyne źródło reguły dziedziczenia prowadzącego.
 *
 * Lekcja z własnym aktywnym przypisaniem → jej prowadzący; bez przypisania
 * lekcji → prowadzący kursu (aktywne przypisanie kursowe, `lesson_id = null`);
 * bez obu → `null`. Ta sama kolejność rozstrzygania i ten sam tie-break
 * (`orderBy('id')`), co konsument wizytówki uczestnika w `CourseDetailResource`.
 *
 * H17 (pytania do prowadzącego) MUSI wołać `forLesson()`, a nie kopiować reguły.
 */
final class AssignmentResolver
{
    /**
     * Prowadzący odpowiedzialny za lekcję według reguły dziedziczenia.
     */
    public function forLesson(Lesson $lesson): ?User
    {
        $lessonAssignment = CourseAssignment::query()
            ->where('lesson_id', $lesson->id)
            ->whereNull('unassigned_at')
            ->orderBy('id')
            ->with('instructor')
            ->first();

        if ($lessonAssignment?->instructor !== null) {
            return $lessonAssignment->instructor;
        }

        return $this->courseInstructor($lesson->course_id);
    }

    /**
     * Prowadzący kursu (aktywne przypisanie kursowe, bez `lesson_id`).
     */
    public function forCourse(Course $course): ?User
    {
        return $this->courseInstructor($course->id);
    }

    private function courseInstructor(int $courseId): ?User
    {
        $assignment = CourseAssignment::query()
            ->where('course_id', $courseId)
            ->whereNull('lesson_id')
            ->whereNull('unassigned_at')
            ->orderBy('id')
            ->with('instructor')
            ->first();

        return $assignment?->instructor;
    }
}
