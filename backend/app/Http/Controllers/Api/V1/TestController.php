<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H10\SubmitAttemptRequest;
use App\Models\Course;
use App\Models\Test;
use App\Models\TestAttempt;
use App\Models\User;
use App\Support\AuditLog;
use App\Support\CourseAccess;
use App\Support\H10\TestGrader;
use App\Support\Notify;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Pakiet H10 · Testy wiedzy — strona uczestnika.
 *
 * GET  /courses/{slug}/test    — pytania bez flag poprawności (jedno na ekranie)
 * POST /tests/{test}/attempts  — podejście: ocenianie serwerowe, numer w transakcji,
 *                                snapshot treści pytań, limit podejść
 * GET  /tests/{test}/attempts  — historia własnych podejść
 */
class TestController extends Controller
{
    public function show(Request $request, string $slug): JsonResponse
    {
        $course = Course::where('slug', $slug)->firstOrFail();

        $test = $course->test()->with(['questions.answers'])->first();

        abort_if($test === null, 404);

        $this->assertUnlocked($request->user(), $course);

        $attemptsUsed = TestAttempt::where('user_id', $request->user()->id)
            ->where('test_id', $test->id)
            ->count();

        return response()->json(['data' => [
            'test_id' => $test->id,
            'pass_threshold' => TestGrader::passThreshold($test),
            'attempts_used' => $attemptsUsed,
            'attempts_limit' => TestGrader::attemptsLimit($test),
            'questions' => $test->questions->map(fn ($question): array => [
                'id' => $question->id,
                'body' => $question->body,
                'sequence_order' => $question->sequence_order,
                'answers' => $question->answers->map(fn ($answer): array => [
                    'id' => $answer->id,
                    'body' => $answer->body,
                ])->values(),
            ])->values(),
        ]]);
    }

    public function storeAttempt(SubmitAttemptRequest $request, Test $test): JsonResponse
    {
        $user = $request->user();
        $test->loadMissing('course');

        $this->assertUnlocked($user, $test->course);

        $limit = TestGrader::attemptsLimit($test);
        $threshold = TestGrader::passThreshold($test);

        $used = TestAttempt::where('user_id', $user->id)->where('test_id', $test->id)->count();

        if ($used >= $limit) {
            throw new ApiException(
                403,
                'attempts_exhausted',
                'Wykorzystałeś wszystkie dostępne podejścia do tego testu.',
                reason: ['attempts_limit' => $limit],
            );
        }

        $snapshot = TestGrader::snapshot($test);
        $graded = TestGrader::grade($snapshot, $request->validated('answers'));
        $passed = $graded['score_percent'] >= $threshold;

        $attempt = DB::transaction(function () use ($user, $test, $request, $snapshot, $graded, $passed): TestAttempt {
            // Postgres zabrania FOR UPDATE z agregatem — blokujemy wiersze,
            // maksimum liczymy w PHP (wzór z komendy demo:pass-test).
            $attemptNumber = 1 + (int) TestAttempt::query()
                ->where('user_id', $user->id)
                ->where('test_id', $test->id)
                ->lockForUpdate()
                ->pluck('attempt_number')
                ->max();

            return TestAttempt::create([
                'user_id' => $user->id,
                'test_id' => $test->id,
                'attempt_number' => $attemptNumber,
                'answers' => $request->validated('answers'),
                'questions_snapshot' => $snapshot,
                'score_percent' => $graded['score_percent'],
                'passed' => $passed,
            ]);
        });

        AuditLog::record($user, 'attempt.finished', $attempt, [
            'test_id' => $test->id,
            'attempt_number' => $attempt->attempt_number,
            'score_percent' => $attempt->score_percent,
            'passed' => $attempt->passed,
        ]);

        if (! $passed && $attempt->attempt_number >= $limit) {
            $this->notifyFinalFailure($user, $test);
        }

        return response()->json(['data' => [
            'attempt_number' => $attempt->attempt_number,
            'score_percent' => $attempt->score_percent,
            'passed' => $attempt->passed,
            'wrong_question_ids' => $graded['wrong_question_ids'],
        ]], 201);
    }

    public function attempts(Request $request, Test $test): JsonResponse
    {
        $page = TestAttempt::where('user_id', $request->user()->id)
            ->where('test_id', $test->id)
            ->orderBy('attempt_number')
            ->paginate(perPage: 25);

        return response()->json([
            'data' => $page->getCollection()->map(fn (TestAttempt $attempt): array => [
                'attempt_number' => $attempt->attempt_number,
                'score_percent' => $attempt->score_percent,
                'passed' => $attempt->passed,
                'created_at' => $attempt->created_at?->toIso8601ZuluString(),
            ])->values(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'last_page' => $page->lastPage(),
                'extra' => [
                    'attempts_used' => $page->total(),
                    'attempts_limit' => TestGrader::attemptsLimit($test),
                    'pass_threshold' => TestGrader::passThreshold($test),
                ],
            ],
        ]);
    }

    /**
     * Blokada sekwencyjna liczona wyłącznie przez CourseAccess ze startera.
     */
    private function assertUnlocked(User $user, Course $course): void
    {
        $state = CourseAccess::state($user, $course);

        if ($state['status'] === 'locked') {
            throw new ApiException(
                403,
                'course_locked',
                'Najpierw ukończ poprzedni etap ścieżki.',
                reason: [
                    'required_course_id' => $state['required_course_id'] ?? null,
                    'missing' => $state['missing'],
                ],
            );
        }
    }

    /**
     * Po ostatnim niezaliczonym podejściu — powiadomienie do opiekunów projektu.
     */
    private function notifyFinalFailure(User $user, Test $test): void
    {
        $title = 'Wyczerpane podejścia do testu';
        $body = sprintf(
            '%s nie zaliczył(a) testu „%s” w ostatnim dostępnym podejściu. Rozważ reset limitu.',
            $user->fullName(),
            $test->course?->title ?? 'kurs',
        );

        foreach (User::where('role', 'project_manager')->get() as $manager) {
            Notify::send($manager, 'attempt.failed_final', $title, $body, '/admin/uczestniczki');
        }
    }
}
