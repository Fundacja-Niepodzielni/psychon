<?php

namespace App\Http\Requests\H08;

use App\Http\Requests\Concerns\ScopesTopicsToAssignedInstructor;

/**
 * PATCH /instructor/courses/{course}/topics/reorder — reguły
 * `ReorderTopicsRequest`, zasięg prowadzącego.
 */
class InstructorReorderTopicsRequest extends ReorderTopicsRequest
{
    use ScopesTopicsToAssignedInstructor;
}
