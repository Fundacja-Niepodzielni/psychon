<?php

namespace App\Http\Requests\H08;

use App\Models\Course;

/**
 * PATCH /instructor/courses/{course} — sama walidacja co `UpdateCourseRequest`
 * (panel administracji), ale `authorize()` sprawdza przypisanie prowadzącego
 * przez `CoursePolicy` PRZED walidacją ciała. Bez tego odmowa zależała od
 * tego, czy body akurat przechodziło reguły (`FormRequest::authorize()`
 * biegnie przed `rules()`) — prowadzący nieprzypisany do kursu potrafił
 * dostać 422 zamiast 403, a `slug` cudzego kursu działał jak wyrocznia
 * istnienia identyfikatora przez regułę `unique`.
 */
class UpdateInstructorCourseRequest extends UpdateCourseRequest
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
