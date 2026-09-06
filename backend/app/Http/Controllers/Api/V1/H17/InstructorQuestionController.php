<?php

namespace App\Http\Controllers\Api\V1\H17;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H17\AnswerQuestionRequest;
use App\Http\Resources\H17\InstructorQuestionResource;
use App\Models\InstructorQuestion;
use App\Services\H17\QuestionRouting;
use App\Support\Notify;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Instructor side of H17: the inbox scoped by the inheritance rule, and the answer.
 */
class InstructorQuestionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $instructor = $request->user();
        $perPage = min(max((int) $request->integer('per_page', 25), 1), 100);

        $query = QuestionRouting::scopeFor($instructor)
            ->with(['user', 'answeredBy', 'lesson.course']);

        if ($request->has('answered')) {
            $request->boolean('answered')
                ? $query->whereNotNull('answered_at')
                : $query->whereNull('answered_at');
        }

        $paginator = $query
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate($perPage);

        return response()->json([
            'data' => collect($paginator->items())
                ->map(fn (InstructorQuestion $question): array => InstructorQuestionResource::make($question)->resolve($request))
                ->values()
                ->all(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
                'extra' => [
                    // Counted over the whole inbox, so the badge does not change
                    // when the reader pages or switches the filter.
                    'unanswered' => QuestionRouting::scopeFor($instructor)
                        ->whereNull('answered_at')
                        ->count(),
                ],
            ],
        ]);
    }

    public function answer(AnswerQuestionRequest $request, int $id): JsonResponse
    {
        $instructor = $request->user();

        $question = DB::transaction(function () use ($request, $instructor, $id): InstructorQuestion {
            $question = QuestionRouting::scopeFor($instructor)
                ->whereKey($id)
                ->lockForUpdate()
                ->first();

            // A question outside this inbox must be indistinguishable from one
            // that does not exist (contract §1.1) — 404, never 403.
            if ($question === null) {
                throw new ApiException(404, 'not_found', 'Nie znaleziono pytania.');
            }

            if ($question->answered_at !== null) {
                throw new ApiException(403, 'entry_locked', 'Na to pytanie już odpowiedziano.');
            }

            $question->answer = $request->validated('answer');
            $question->answered_by = $instructor->id;
            $question->answered_at = now();
            $question->save();

            return $question;
        });

        $question->load(['user', 'answeredBy', 'lesson.course']);

        Notify::send(
            $question->user,
            'question.answered',
            'Odpowiedź na Twoje pytanie',
            "Odpowiedź do lekcji „{$question->lesson->title}”: {$question->answer}",
            "/panel/kursy/{$question->lesson->course->slug}",
        );

        return response()->json([
            'data' => InstructorQuestionResource::make($question)->resolve($request),
        ]);
    }
}
