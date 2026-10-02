<?php

namespace App\Http\Requests\H10;

use App\Http\Requests\Concerns\AuthorizesAgainstScopedTest;

/**
 * POST /instructor/tests/{test}/questions — reguły `StoreTestQuestionRequest`
 * (panel administracji), ale `authorize()` sprawdza zasięg prowadzącego
 * PRZED walidacją ciała — patrz opis cechy.
 */
class StoreInstructorTestQuestionRequest extends StoreTestQuestionRequest
{
    use AuthorizesAgainstScopedTest;
}
