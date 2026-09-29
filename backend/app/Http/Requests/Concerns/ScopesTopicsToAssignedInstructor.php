<?php

namespace App\Http\Requests\Concerns;

use App\Services\H08\TopicScope;

/**
 * Zasięg tras tematów prowadzącego: wyłącznie kursy z jego aktywnym
 * przypisaniem na poziomie kursu. Kurs spoza zasięgu wygląda na zewnątrz
 * tak samo jak nieistniejący (404) — patrz `TopicScope`.
 */
trait ScopesTopicsToAssignedInstructor
{
    protected function topicScope(): TopicScope
    {
        return TopicScope::instructor($this->user());
    }
}
