<?php

namespace App\Http\Requests\H08;

use App\Models\Course;
use App\Models\Lesson;

/**
 * POST /instructor/lessons/{lesson}/materials · POST /instructor/courses/{course}/materials
 * — sama walidacja co `StoreMaterialRequest` (panel administracji), ale
 * `authorize()` sprawdza przypisanie prowadzącego do kursu przez
 * `CoursePolicy` PRZED walidacją ciała — patrz `UpdateInstructorCourseRequest`.
 * Trasa wisi albo na `{lesson}`, albo na `{course}` — obsługujemy oba, tak
 * jak `InstructorMaterialController::storeForLesson()`/`storeForCourse()`.
 */
class StoreInstructorMaterialRequest extends StoreMaterialRequest
{
    public function authorize(): bool
    {
        $course = $this->courseFromRoute();

        return $course !== null && (bool) $this->user()?->can('update', $course);
    }

    private function courseFromRoute(): ?Course
    {
        $lesson = $this->route('lesson');

        if ($lesson instanceof Lesson) {
            return $lesson->course()->withTrashed()->first();
        }

        $course = $this->route('course');

        return $course instanceof Course ? $course : null;
    }
}
