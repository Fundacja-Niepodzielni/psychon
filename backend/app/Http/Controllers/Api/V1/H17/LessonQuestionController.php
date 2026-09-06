<?php

namespace App\Http\Controllers\Api\V1\H17;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H17\StoreLessonQuestionRequest;
use App\Http\Resources\H17\ParticipantQuestionResource;
use App\Models\InstructorQuestion;
use App\Models\Lesson;
use App\Models\User;
use App\Services\H17\QuestionRouting;
use App\Support\CourseAccess;
use App\Support\Notify;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Participant side of H17: ask a question about a lesson and read your own
 * questions with their answers.
 *
 * Note: no AuditLog anywhere in this package — registry §3.2 of the API contract
 * has no `question.*` slug, and inventing one is forbidden.
 */
class LessonQuestionController extends Controller
{
    public function index(Request $request, int $id): JsonResponse
    {
        $lesson = $this->authorizedLesson($request, $id);
        $perPage = min(max((int) $request->integer('per_page', 25), 1), 100);

        $paginator = InstructorQuestion::query()
            ->where('lesson_id', $lesson->id)
            ->where('user_id', $request->user()->id)
            ->with('answeredBy')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate($perPage);

        return response()->json([
            'data' => collect($paginator->items())
                ->map(fn (InstructorQuestion $question): array => ParticipantQuestionResource::make($question)->resolve($request))
                ->values()
                ->all(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function store(StoreLessonQuestionRequest $request, int $id): JsonResponse
    {
        $lesson = $this->authorizedLesson($request, $id);

        $question = InstructorQuestion::create([
            'user_id' => $request->user()->id,
            'lesson_id' => $lesson->id,
            'question' => $request->validated('question'),
        ]);

        $this->notifyInstructor($lesson, $question);

        return response()->json([
            'data' => ParticipantQuestionResource::make($question)->resolve($request),
        ], 201);
    }

    /**
     * Same gate H06 applies to lesson content: CourseAccess stays the single
     * source of truth for the sequential rule, this only translates its verdict
     * into the contract's error envelope.
     */
    private function authorizedLesson(Request $request, int $id): Lesson
    {
        $lesson = Lesson::query()->with('course')->find($id);

        if ($lesson === null || $lesson->course === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono lekcji.');
        }

        $state = CourseAccess::state($request->user(), $lesson->course);

        if ($state['status'] === 'locked') {
            throw new ApiException(
                403,
                'course_locked',
                'Ten kurs jest jeszcze zablokowany.',
                reason: [
                    'required_course_id' => $state['required_course_id'] ?? null,
                    'missing' => $state['missing'] ?? [],
                ],
            );
        }

        return $lesson;
    }

    /**
     * A lesson with no active assignment has no addressee — the question is still
     * recorded, but nobody is notified. Rejecting it would punish the asker for a
     * gap in the administration's configuration.
     */
    private function notifyInstructor(Lesson $lesson, InstructorQuestion $question): void
    {
        $instructor = QuestionRouting::forLesson($lesson);

        if (! $instructor instanceof User) {
            return;
        }

        Notify::send(
            $instructor,
            'question.asked',
            'Nowe pytanie do lekcji',
            "Pytanie do lekcji „{$lesson->title}”: {$question->question}",
            '/prowadzacy/pytania',
        );
    }
}
