<?php

namespace App\Http\Requests\H10;

use App\Http\Requests\Concerns\AuthorizesAgainstScopedQuestion;
use Illuminate\Foundation\Http\FormRequest;

/**
 * DELETE /instructor/questions/{question} — bez ciała, sam zasięg prowadzącego
 * (`AuthorizesAgainstScopedQuestion`).
 */
class InstructorTestQuestionRequest extends FormRequest
{
    use AuthorizesAgainstScopedQuestion;

    public function rules(): array
    {
        return [];
    }
}
