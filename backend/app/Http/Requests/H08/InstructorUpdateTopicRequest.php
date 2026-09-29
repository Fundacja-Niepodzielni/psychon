<?php

namespace App\Http\Requests\H08;

use App\Http\Requests\Concerns\ScopesTopicsToAssignedInstructor;

/**
 * PATCH /instructor/topics/{topic} — reguły `UpdateTopicRequest`, zasięg
 * prowadzącego.
 */
class InstructorUpdateTopicRequest extends UpdateTopicRequest
{
    use ScopesTopicsToAssignedInstructor;
}
