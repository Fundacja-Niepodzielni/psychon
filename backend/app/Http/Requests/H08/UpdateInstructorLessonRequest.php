<?php

namespace App\Http\Requests\H08;

use App\Models\Lesson;

/**
 * PATCH /instructor/lessons/{lesson} — sama walidacja co
 * `UpdateLessonRequest` (panel administracji), ale `authorize()` sprawdza
 * przypisanie prowadzącego do kursu lekcji przez `CoursePolicy` PRZED
 * walidacją ciała — patrz `UpdateInstructorCourseRequest`. Kurs miękko
 * usunięty nadal jest poprawnym podmiotem sprawdzki (`withTrashed()`),
 * tak samo jak w `InstructorLessonController::authorizeLesson()`.
 */
class UpdateInstructorLessonRequest extends UpdateLessonRequest
{
    public function authorize(): bool
    {
        $lesson = $this->route('lesson');

        if (! $lesson instanceof Lesson) {
            return false;
        }

        $course = $lesson->course()->withTrashed()->first();

        return $course !== null && (bool) $this->user()?->can('update', $course);
    }
}
