<?php

namespace App\Http\Requests\H08;

use App\Http\Requests\Concerns\AuthorizesAgainstAssignedCourse;

/**
 * PATCH /instructor/courses/{course} — sama walidacja co `UpdateCourseRequest`
 * (panel administracji), ale `authorize()` (`AuthorizesAgainstAssignedCourse`)
 * sprawdza przypisanie prowadzącego przez `CoursePolicy` PRZED walidacją
 * ciała — patrz opis cechy.
 */
class UpdateInstructorCourseRequest extends UpdateCourseRequest
{
    use AuthorizesAgainstAssignedCourse;
}
