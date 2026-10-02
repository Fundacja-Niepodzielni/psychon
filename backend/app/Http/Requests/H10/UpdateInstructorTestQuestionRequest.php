<?php

namespace App\Http\Requests\H10;

use App\Http\Requests\Concerns\AuthorizesAgainstScopedQuestion;

/**
 * PATCH /instructor/questions/{question} — reguły `UpdateTestQuestionRequest`
 * (panel administracji), ale `authorize()` sprawdza zasięg prowadzącego
 * PRZED walidacją ciała — patrz opis cechy.
 */
class UpdateInstructorTestQuestionRequest extends UpdateTestQuestionRequest
{
    use AuthorizesAgainstScopedQuestion;
}
