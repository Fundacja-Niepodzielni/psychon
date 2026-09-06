<?php

use App\Exceptions\ApiException;
use App\Models\Lesson;
use App\Models\LessonProgress;
use App\Support\CourseAccess;
use App\Support\Settings;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

if (! class_exists('H06ProgressRequest', false)) {
    final class H06ProgressRequest extends FormRequest
    {
        public function authorize(): bool
        {
            return true;
        }

        public function rules(): array
        {
            return [
                'watched_delta' => ['required', 'integer', 'min:0'],
                'active_delta' => ['required', 'integer', 'min:0'],
            ];
        }
    }
}

/*
|--------------------------------------------------------------------------
| Pakiet H06 · Lekcja — odtwarzacz i postęp
|--------------------------------------------------------------------------
| Routes owned by team H06 — other teams must not edit this file (§5.1).
| Register routes here; they are loaded inside the /api/v1 group.
| Every route requires auth unless listed in config/public_routes.php:
|
|     Route::middleware(['auth:sanctum', 'access.active'])
|         ->get('/example', ExampleController::class);
|
| Contract: docs/hackathon/02-kontrakt-api.md · flag: config('features.h06')
*/

if (config('features.h06')) {
    /**
     * H06 owns access checks for lesson content, while CourseAccess remains
     * the single source of truth for the sequential course rule.
     */
    $authorizeLesson = static function (Request $request, Lesson $lesson): void {
        $lesson->loadMissing('course');
        $state = CourseAccess::state($request->user(), $lesson->course);

        if ($state['status'] !== 'locked') {
            return;
        }

        throw new ApiException(
            403,
            'course_locked',
            'Ten kurs jest jeszcze zablokowany.',
            reason: [
                'required_course_id' => $state['required_course_id'] ?? null,
                'missing' => $state['missing'] ?? [],
            ],
        );
    };

    /**
     * Create the user's progress row without a race-prone read-before-insert.
     * The unique (user_id, lesson_id) constraint is the final guard.
     */
    $ensureProgress = static function (int $userId, int $lessonId): void {
        $now = now();

        DB::table('lesson_progress')->insertOrIgnore([
            'user_id' => $userId,
            'lesson_id' => $lessonId,
            'watched_seconds' => 0,
            'active_seconds' => 0,
            'open_count' => 0,
            'last_activity_at' => null,
            'is_completed' => false,
            'completed_at' => null,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    };

    $completion = static function (Lesson $lesson, LessonProgress $progress): array {
        $percent = (int) Settings::edition('lesson_completion_percent');
        $duration = (int) $lesson->duration_seconds;
        $requiredActiveSeconds = $duration > 0
            ? (int) ceil($duration * $percent / 100)
            : 0;

        return [
            'watched_seconds' => (int) $progress->watched_seconds,
            'active_seconds' => (int) $progress->active_seconds,
            'completable' => $duration > 0 && $progress->active_seconds >= $requiredActiveSeconds,
            'completable_at_percent' => $percent,
        ];
    };

    Route::middleware(['auth:sanctum', 'access.active'])->group(function () use (
        $authorizeLesson,
        $ensureProgress,
        $completion,
    ): void {
        Route::get('/lessons/{id}', function (Request $request, Lesson $id) use (
            $authorizeLesson,
            $ensureProgress,
            $completion,
        ) {
            $lesson = $id;
            $authorizeLesson($request, $lesson);

            /** @var LessonProgress $progress */
            $progress = DB::transaction(function () use ($request, $lesson, $ensureProgress): LessonProgress {
                $userId = (int) $request->user()->id;
                $ensureProgress($userId, (int) $lesson->id);

                $record = LessonProgress::query()
                    ->where('user_id', $userId)
                    ->where('lesson_id', $lesson->id)
                    ->lockForUpdate()
                    ->firstOrFail();

                $record->open_count = (int) $record->open_count + 1;
                $record->save();

                return $record;
            });

            $snapshot = $completion($lesson, $progress);

            return response()->json([
                'data' => [
                    'id' => (int) $lesson->id,
                    'title' => $lesson->title,
                    'description' => $lesson->description,
                    'duration_seconds' => (int) $lesson->duration_seconds,
                    'watched_seconds' => (int) $progress->watched_seconds,
                    'active_seconds' => (int) $progress->active_seconds,
                    'is_completed' => (bool) $progress->is_completed,
                    'completable' => $snapshot['completable'],
                    'completable_at_percent' => $snapshot['completable_at_percent'],
                ],
            ]);
        });

        Route::post('/lessons/{id}/progress', function (H06ProgressRequest $request, Lesson $id) use (
            $authorizeLesson,
            $ensureProgress,
            $completion,
        ) {
            $lesson = $id;
            $authorizeLesson($request, $lesson);

            $values = $request->validated();

            /** @var LessonProgress $progress */
            $progress = DB::transaction(function () use ($request, $lesson, $ensureProgress, $values): LessonProgress {
                $userId = (int) $request->user()->id;
                $ensureProgress($userId, (int) $lesson->id);

                $record = LessonProgress::query()
                    ->where('user_id', $userId)
                    ->where('lesson_id', $lesson->id)
                    ->lockForUpdate()
                    ->firstOrFail();

                $now = now();
                $activeDelta = min((int) $values['active_delta'], 35);

                if ($record->last_activity_at !== null) {
                    $availableSeconds = max(
                        0,
                        $now->getTimestamp() - $record->last_activity_at->getTimestamp(),
                    );
                    $activeDelta = min($activeDelta, $availableSeconds);
                }

                $record->watched_seconds = (int) $record->watched_seconds + (int) $values['watched_delta'];
                $record->active_seconds = (int) $record->active_seconds + $activeDelta;
                $record->last_activity_at = $now;
                $record->save();

                return $record;
            });

            return response()->json(['data' => $completion($lesson, $progress)]);
        });

        Route::post('/lessons/{id}/complete', function (Request $request, Lesson $id) use (
            $authorizeLesson,
            $ensureProgress,
            $completion,
        ) {
            $lesson = $id;
            $authorizeLesson($request, $lesson);

            /** @var LessonProgress $progress */
            $progress = DB::transaction(function () use ($request, $lesson, $ensureProgress, $completion): LessonProgress {
                $userId = (int) $request->user()->id;
                $ensureProgress($userId, (int) $lesson->id);

                $record = LessonProgress::query()
                    ->where('user_id', $userId)
                    ->where('lesson_id', $lesson->id)
                    ->lockForUpdate()
                    ->firstOrFail();

                if ($lesson->duration_seconds <= 0) {
                    throw new ApiException(
                        422,
                        'not_enough_active_time',
                        'Obejrzyj więcej materiału, aby ukończyć lekcję.',
                    );
                }

                if ($record->is_completed) {
                    return $record;
                }

                $snapshot = $completion($lesson, $record);
                if (! $snapshot['completable']) {
                    throw new ApiException(
                        422,
                        'not_enough_active_time',
                        'Obejrzyj więcej materiału, aby ukończyć lekcję.',
                    );
                }

                $record->is_completed = true;
                $record->completed_at = now();
                $record->save();

                return $record;
            });

            return response()->json([
                'data' => [
                    'is_completed' => true,
                    'completed_at' => $progress->completed_at?->utc()->toISOString(),
                ],
            ]);
        });
    });
}
