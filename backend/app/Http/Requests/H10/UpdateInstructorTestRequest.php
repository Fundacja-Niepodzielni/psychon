<?php

namespace App\Http\Requests\H10;

use App\Http\Requests\Concerns\AuthorizesAgainstAssignedCourse;
use App\Models\Course;
use App\Models\Test;

/**
 * PATCH /instructor/tests/{test} — sama walidacja co `UpdateTestRequest`
 * (panel administracji), ale `authorize()` (`AuthorizesAgainstAssignedCourse`)
 * sprawdza przypisanie prowadzącego do kursu testu przez `CoursePolicy`
 * PRZED walidacją ciała — patrz opis cechy. Kurs miękko usunięty nadal jest
 * poprawnym podmiotem sprawdzki (`withTrashed()`), tak samo jak w
 * `InstructorTestController::update()`.
 */
class UpdateInstructorTestRequest extends UpdateTestRequest
{
    use AuthorizesAgainstAssignedCourse;

    protected function resolveCourseForAuthorization(): ?Course
    {
        $test = $this->route('test');

        return $test instanceof Test ? $test->course()->withTrashed()->first() : null;
    }
}
