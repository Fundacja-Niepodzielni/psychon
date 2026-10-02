<?php

namespace App\Http\Requests\Concerns;

use App\Models\TestQuestion;
use App\Support\H10\QuestionBankScope;

/**
 * `authorize()` żądań banku pytań prowadzącego, które wiszą na pytaniu
 * (`…/questions/{question}`): odnajduje pytanie w zasięgu prowadzącego
 * (`QuestionBankScope`) PRZED walidacją ciała — pytanie testu kursu spoza
 * zasięgu i pytanie nieistniejące dają ten sam wyjątek 404.
 */
trait AuthorizesAgainstScopedQuestion
{
    private ?TestQuestion $scopedQuestion = null;

    public function authorize(): bool
    {
        $this->scopedQuestion = $this->questionBankScope()->question($this->route('question'));

        return true;
    }

    public function scopedQuestion(): TestQuestion
    {
        return $this->scopedQuestion ??= $this->questionBankScope()->question($this->route('question'));
    }

    protected function questionBankScope(): QuestionBankScope
    {
        return QuestionBankScope::instructor($this->user());
    }
}
