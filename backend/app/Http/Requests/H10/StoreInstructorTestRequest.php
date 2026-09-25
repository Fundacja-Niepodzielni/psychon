<?php

namespace App\Http\Requests\H10;

use App\Models\Course;

/**
 * POST /instructor/courses/{course}/tests — sama walidacja co
 * `StoreTestRequest` (panel administracji), ale `authorize()` sprawdza
 * przypisanie prowadzącego do kursu przez `CoursePolicy` PRZED walidacją
 * ciała — patrz `App\Http\Requests\H08\UpdateInstructorCourseRequest`.
 */
class StoreInstructorTestRequest extends StoreTestRequest
{
    public function authorize(): bool
    {
        $course = $this->route('course');

        if (! $course instanceof Course) {
            return false;
        }

        return (bool) $this->user()?->can('update', $course);
    }
}
