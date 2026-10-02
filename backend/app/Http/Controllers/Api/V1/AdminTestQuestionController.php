<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\H10\StoreTestQuestionRequest;
use App\Http\Requests\H10\UpdateTestQuestionRequest;
use App\Models\Test;
use App\Models\TestQuestion;
use App\Support\H10\TestQuestionBank;
use Illuminate\Http\JsonResponse;

/**
 * Pakiet H10 · Bank pytań w panelu administracji.
 *
 * GET    /admin/tests/{test}/questions   — pełna lista pytań z flagami poprawności
 * POST   /admin/tests/{test}/questions   — nowe pytanie
 * PATCH  /admin/questions/{question}     — edycja pytania / odpowiedzi
 * DELETE /admin/questions/{question}     — usunięcie pytania
 *
 * Reguły zapisu i kształt odpowiedzi trzyma `TestQuestionBank` — ta sama
 * usługa obsługuje trasy prowadzącego własnego kursu (`/instructor/...`).
 * Edycja i usuwanie nie ruszają historii — podejścia trzymają własny
 * `questions_snapshot` (kryteria 3 i 6). Rejestr audytu §3.2 nie przewiduje
 * sluga dla zmian w banku pytań, więc te operacje nie są audytowane.
 */
class AdminTestQuestionController extends Controller
{
    public function index(Test $test): JsonResponse
    {
        return response()->json([
            'data' => TestQuestionBank::list($test),
        ]);
    }

    public function store(StoreTestQuestionRequest $request, Test $test): JsonResponse
    {
        return response()->json(
            ['data' => TestQuestionBank::create($test, $request->validated('body'), $request->validated('answers'))],
            201,
        );
    }

    public function update(UpdateTestQuestionRequest $request, TestQuestion $question): JsonResponse
    {
        return response()->json(['data' => TestQuestionBank::update(
            $question,
            $request->safe()->only(['body', 'sequence_order']),
            $request->has('answers') ? $request->validated('answers') : null,
        )]);
    }

    public function destroy(TestQuestion $question): JsonResponse
    {
        return response()->json(['data' => TestQuestionBank::delete($question)]);
    }
}
