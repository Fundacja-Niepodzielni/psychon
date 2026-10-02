<?php

namespace App\Http\Requests\H10;

use App\Http\Requests\Concerns\AuthorizesAgainstScopedTest;
use Illuminate\Foundation\Http\FormRequest;

/**
 * GET /instructor/tests/{test}/questions — bez ciała, sam zasięg prowadzącego
 * (`AuthorizesAgainstScopedTest`).
 */
class InstructorTestQuestionsRequest extends FormRequest
{
    use AuthorizesAgainstScopedTest;

    public function rules(): array
    {
        return [];
    }
}
