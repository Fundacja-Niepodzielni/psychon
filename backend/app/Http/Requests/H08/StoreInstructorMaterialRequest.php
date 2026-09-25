<?php

namespace App\Http\Requests\H08;

use App\Http\Requests\Concerns\AuthorizesAgainstAssignedCourse;
use App\Models\Course;
use App\Models\Lesson;

/**
 * POST /instructor/lessons/{lesson}/materials · POST /instructor/courses/{course}/materials
 * — sama walidacja co `StoreMaterialRequest` (panel administracji), ale
 * `authorize()` (`AuthorizesAgainstAssignedCourse`) sprawdza przypisanie
 * prowadzącego do kursu przez `CoursePolicy` PRZED walidacją ciała — patrz
 * opis cechy. Trasa wisi albo na `{lesson}`, albo na `{course}` —
 * obsługujemy oba, tak jak
 * `InstructorMaterialController::storeForLesson()`/`storeForCourse()`.
 */
class StoreInstructorMaterialRequest extends StoreMaterialRequest
{
    use AuthorizesAgainstAssignedCourse;

    protected function resolveCourseForAuthorization(): ?Course
    {
        $lesson = $this->route('lesson');

        if ($lesson instanceof Lesson) {
            return $lesson->course()->withTrashed()->first();
        }

        $course = $this->route('course');

        return $course instanceof Course ? $course : null;
    }
}
