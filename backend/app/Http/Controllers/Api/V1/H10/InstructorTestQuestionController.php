<?php

namespace App\Http\Controllers\Api\V1\H10;

use App\Http\Controllers\Controller;
use App\Http\Requests\H10\InstructorTestQuestionRequest;
use App\Http\Requests\H10\InstructorTestQuestionsRequest;
use App\Http\Requests\H10\StoreInstructorTestQuestionRequest;
use App\Http\Requests\H10\UpdateInstructorTestQuestionRequest;
use App\Support\H10\TestQuestionBank;
use Illuminate\Http\JsonResponse;

/**
 * Bank pytań testu końcowego kursu przypisanego prowadzącego — trasy
 * `role:instructor` w `routes/api/h10.php`. Ta sama usługa i te same reguły
 * co panel administracji (`TestQuestionBank`, żądania pochodne od
 * `StoreTestQuestionRequest`/`UpdateTestQuestionRequest`); różni je zasięg
 * (`QuestionBankScope` w `authorize()` żądań): test albo pytanie kursu bez
 * aktywnego przypisania prowadzącego daje to samo 404 co zasób nieistniejący,
 * przed walidacją ciała.
 *
 * Identyfikatory z adresu czyta wyłącznie żądanie (`authorize()`), więc trasy
 * nie wiążą modeli i nie mają typowanych parametrów — identyfikator spoza
 * zakresu liczb całkowitych jest tym samym 404 co każdy inny nieznany.
 */
class InstructorTestQuestionController extends Controller
{
    public function index(InstructorTestQuestionsRequest $request): JsonResponse
    {
        return response()->json([
            'data' => TestQuestionBank::list($request->scopedTest()),
        ]);
    }

    public function store(StoreInstructorTestQuestionRequest $request): JsonResponse
    {
        return response()->json(
            ['data' => TestQuestionBank::create($request->scopedTest(), $request->validated('body'), $request->validated('answers'))],
            201,
        );
    }

    public function update(UpdateInstructorTestQuestionRequest $request): JsonResponse
    {
        return response()->json(['data' => TestQuestionBank::update(
            $request->scopedQuestion(),
            $request->safe()->only(['body', 'sequence_order']),
            $request->has('answers') ? $request->validated('answers') : null,
        )]);
    }

    public function destroy(InstructorTestQuestionRequest $request): JsonResponse
    {
        return response()->json(['data' => TestQuestionBank::delete($request->scopedQuestion())]);
    }
}
