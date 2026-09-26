<?php

namespace App\Http\Requests\H08;

use App\Http\Requests\Concerns\AuthorizesAgainstAssignedCourse;
use App\Models\Course;
use App\Models\Lesson;

/**
 * PATCH /instructor/lessons/{lesson} — sama walidacja co
 * `UpdateLessonRequest` (panel administracji), ale `authorize()`
 * (`AuthorizesAgainstAssignedCourse`) sprawdza przypisanie prowadzącego do
 * kursu lekcji przez `CoursePolicy` PRZED walidacją ciała — patrz opis
 * cechy. Kurs miękko usunięty nadal jest poprawnym podmiotem sprawdzki
 * (`withTrashed()`), tak samo jak w `InstructorLessonController::authorizeLesson()`.
 */
class UpdateInstructorLessonRequest extends UpdateLessonRequest
{
    use AuthorizesAgainstAssignedCourse;

    protected function resolveCourseForAuthorization(): ?Course
    {
        $lesson = $this->route('lesson');

        return $lesson instanceof Lesson ? $lesson->course()->withTrashed()->first() : null;
    }
}
