<?php

namespace App\Http\Requests\H10;

use App\Models\Test;

/**
 * PATCH /instructor/tests/{test} — sama walidacja co `UpdateTestRequest`
 * (panel administracji), ale `authorize()` sprawdza przypisanie
 * prowadzącego do kursu testu przez `CoursePolicy` PRZED walidacją ciała —
 * patrz `App\Http\Requests\H08\UpdateInstructorCourseRequest`. Kurs miękko
 * usunięty nadal jest poprawnym podmiotem sprawdzki (`withTrashed()`), tak
 * samo jak w `InstructorTestController::update()`.
 */
class UpdateInstructorTestRequest extends UpdateTestRequest
{
    public function authorize(): bool
    {
        $test = $this->route('test');

        if (! $test instanceof Test) {
            return false;
        }

        $course = $test->course()->withTrashed()->first();

        return $course !== null && (bool) $this->user()?->can('update', $course);
    }
}
