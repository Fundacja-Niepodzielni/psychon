<?php

namespace App\Http\Requests\H08;

use App\Http\Requests\Concerns\ScopesTopicsToAssignedInstructor;

/**
 * POST /instructor/courses/{course}/topics — reguły `StoreTopicRequest`,
 * zasięg prowadzącego.
 */
class InstructorStoreTopicRequest extends StoreTopicRequest
{
    use ScopesTopicsToAssignedInstructor;
}
