<?php

namespace App\Http\Requests\H08;

use App\Http\Requests\Concerns\ScopesTopicsToAssignedInstructor;

/**
 * GET /instructor/courses/{course}/topics — zasięg prowadzącego.
 */
class InstructorCourseTopicRequest extends CourseTopicRequest
{
    use ScopesTopicsToAssignedInstructor;
}
