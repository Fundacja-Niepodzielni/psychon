<?php

namespace App\Http\Requests\H08;

use App\Http\Requests\Concerns\ScopesTopicsToAssignedInstructor;

/**
 * DELETE /instructor/topics/{topic} — zasięg prowadzącego.
 */
class InstructorTopicRequest extends TopicRequest
{
    use ScopesTopicsToAssignedInstructor;
}
