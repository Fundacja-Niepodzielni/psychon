<?php

namespace App\Http\Requests\Concerns;

use App\Models\Test;
use App\Support\H10\QuestionBankScope;

/**
 * `authorize()` żądań banku pytań prowadzącego, które wiszą na teście
 * (`…/tests/{test}/questions`): odnajduje test w zasięgu prowadzącego
 * (`QuestionBankScope`) PRZED walidacją ciała — test kursu spoza zasięgu
 * i test nieistniejący dają ten sam wyjątek 404. Zła rola odpada wcześniej,
 * na middleware `role:` trasy.
 */
trait AuthorizesAgainstScopedTest
{
    private ?Test $scopedTest = null;

    public function authorize(): bool
    {
        $this->scopedTest = $this->questionBankScope()->test($this->route('test'));

        return true;
    }

    public function scopedTest(): Test
    {
        return $this->scopedTest ??= $this->questionBankScope()->test($this->route('test'));
    }

    protected function questionBankScope(): QuestionBankScope
    {
        return QuestionBankScope::instructor($this->user());
    }
}
