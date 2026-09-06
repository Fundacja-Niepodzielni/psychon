<?php

namespace App\Services\H07;

use App\Exceptions\ApiException;
use App\Models\LessonProgress;
use App\Models\User;
use App\Support\Settings;

final class ReliabilityDetailQuery
{
    public function __construct(private readonly ReliabilityPresenter $presenter) {}

    /** @return array<string, mixed> */
    public function find(int $userId): array
    {
        $user = User::query()
            ->whereKey($userId)
            ->where('edition_id', Settings::activeEdition()->id)
            ->whereIn('role', ['volunteer', 'student'])
            ->where('status', 'active')
            ->first();

        if ($user === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono osoby.');
        }

        $lessons = $user->lessonProgress()
            ->where('is_completed', true)
            ->whereHas('lesson', fn ($query) => $query->where('duration_seconds', '>', 0))
            ->with('lesson:id,title,duration_seconds')
            ->get()
            ->map(function (LessonProgress $progress): array {
                $durationSeconds = (int) $progress->lesson->duration_seconds;

                return [
                    'id' => (int) $progress->lesson->id,
                    'title' => $progress->lesson->title,
                    'active_seconds' => (int) $progress->active_seconds,
                    'duration_seconds' => $durationSeconds,
                    'open_count' => (int) $progress->open_count,
                    'last_activity_at' => $progress->last_activity_at?->toIso8601ZuluString(),
                    'below_threshold' => $this->presenter->lessonIsBelowThreshold(
                        (int) $progress->active_seconds,
                        $durationSeconds,
                    ),
                ];
            })
            ->sortBy([
                fn (array $left, array $right): int => $right['below_threshold'] <=> $left['below_threshold'],
                fn (array $left, array $right): int => strcmp(
                    $right['last_activity_at'] ?? '',
                    $left['last_activity_at'] ?? '',
                ),
                fn (array $left, array $right): int => $left['id'] <=> $right['id'],
            ])
            ->values()
            ->all();

        return [
            ...$this->presenter->adminSummary($user),
            'lessons' => $lessons,
        ];
    }
}
