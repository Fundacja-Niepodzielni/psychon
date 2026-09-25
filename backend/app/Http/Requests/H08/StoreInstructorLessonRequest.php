<?php

namespace App\Http\Requests\H08;

use App\Http\Requests\Concerns\AuthorizesAgainstAssignedCourse;

/**
 * POST /instructor/courses/{course}/lessons — sama walidacja co
 * `StoreLessonRequest` (panel administracji), ale `authorize()`
 * (`AuthorizesAgainstAssignedCourse`) sprawdza przypisanie prowadzącego
 * przez `CoursePolicy` PRZED walidacją ciała — patrz opis cechy.
 */
class StoreInstructorLessonRequest extends StoreLessonRequest
{
    use AuthorizesAgainstAssignedCourse;
}
