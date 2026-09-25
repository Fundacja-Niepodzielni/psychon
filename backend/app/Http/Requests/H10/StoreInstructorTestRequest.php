<?php

namespace App\Http\Requests\H10;

use App\Http\Requests\Concerns\AuthorizesAgainstAssignedCourse;

/**
 * POST /instructor/courses/{course}/tests — sama walidacja co
 * `StoreTestRequest` (panel administracji), ale `authorize()`
 * (`AuthorizesAgainstAssignedCourse`) sprawdza przypisanie prowadzącego do
 * kursu przez `CoursePolicy` PRZED walidacją ciała — patrz opis cechy.
 */
class StoreInstructorTestRequest extends StoreTestRequest
{
    use AuthorizesAgainstAssignedCourse;
}
