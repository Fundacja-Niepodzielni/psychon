<?php

namespace App\Http\Requests\H08;

use App\Models\Course;

/**
 * POST /instructor/courses/{course}/lessons — sama walidacja co
 * `StoreLessonRequest` (panel administracji), ale `authorize()` sprawdza
 * przypisanie prowadzącego przez `CoursePolicy` PRZED walidacją ciała —
 * patrz `UpdateInstructorCourseRequest`.
 */
class StoreInstructorLessonRequest extends StoreLessonRequest
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
