<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\H10\StoreTestQuestionRequest;
use App\Http\Requests\H10\UpdateTestQuestionRequest;
use App\Models\Test;
use App\Models\TestQuestion;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * Pakiet H10 · Bank pytań w panelu administracji.
 *
 * GET    /admin/tests/{test}/questions   — pełna lista pytań z flagami poprawności
 * POST   /admin/tests/{test}/questions   — nowe pytanie
 * PATCH  /admin/questions/{question}     — edycja pytania / odpowiedzi
 * DELETE /admin/questions/{question}     — usunięcie pytania
 *
 * Edycja i usuwanie nie ruszają historii — podejścia trzymają własny
 * `questions_snapshot` (kryteria 3 i 6). Rejestr audytu §3.2 nie przewiduje
 * sluga dla zmian w banku pytań, więc te operacje nie są audytowane.
 */
class AdminTestQuestionController extends Controller
{
    public function index(Test $test): JsonResponse
    {
        $questions = $test->questions()->with('answers')->get();

        return response()->json([
            'data' => $questions->map($this->present(...))->values(),
        ]);
    }

    public function store(StoreTestQuestionRequest $request, Test $test): JsonResponse
    {
        $question = DB::transaction(function () use ($request, $test): TestQuestion {
            $nextOrder = 1 + (int) $test->questions()->max('sequence_order');

            $question = $test->questions()->create([
                'body' => $request->validated('body'),
                'sequence_order' => $nextOrder,
            ]);

            foreach ($request->validated('answers') as $answer) {
                $question->answers()->create([
                    'body' => $answer['body'],
                    'is_correct' => $answer['is_correct'],
                ]);
            }

            return $question;
        });

        return response()->json(
            ['data' => $this->present($question->load('answers'))],
            201,
        );
    }

    public function update(UpdateTestQuestionRequest $request, TestQuestion $question): JsonResponse
    {
        DB::transaction(function () use ($request, $question): void {
            $question->fill($request->safe()->only(['body', 'sequence_order']));
            $question->save();

            if (! $request->has('answers')) {
                return;
            }

            $keepIds = [];

            foreach ($request->validated('answers') as $answer) {
                $model = isset($answer['id'])
                    ? $question->answers()->whereKey($answer['id'])->first()
                    : null;

                if ($model === null) {
                    $model = $question->answers()->make();
                }

                $model->body = $answer['body'];
                $model->is_correct = $answer['is_correct'];
                $model->question_id = $question->id;
                $model->save();

                $keepIds[] = $model->id;
            }

            $question->answers()->whereKeyNot($keepIds)->delete();
        });

        return response()->json(['data' => $this->present($question->fresh('answers'))]);
    }

    public function destroy(TestQuestion $question): JsonResponse
    {
        $question->delete();

        return response()->json(['data' => ['id' => $question->id, 'deleted' => true]]);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(TestQuestion $question): array
    {
        return [
            'id' => $question->id,
            'body' => $question->body,
            'sequence_order' => $question->sequence_order,
            'answers' => $question->answers
                ->sortBy('id')
                ->map(fn ($answer): array => [
                    'id' => $answer->id,
                    'body' => $answer->body,
                    'is_correct' => (bool) $answer->is_correct,
                ])
                ->values(),
        ];
    }
}
