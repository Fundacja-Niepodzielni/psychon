<?php

namespace App\Support;

use App\Models\Course;
use App\Models\SupervisionSignup;
use App\Models\User;
use App\Models\WorkshopCompletion;

/**
 * The single source of progress numbers (person card, dashboard, report,
 * certificate conditions — H13/H18/H19/H20). FROZEN SIGNATURE.
 */
final class ProgressAggregator
{
    /**
     * @return array{
     *     courses_done: int,
     *     courses_total: int,
     *     hours_accepted: string,
     *     supervision_present: int,
     *     workshop_done: bool,
     *     reliability_percent: int|null,
     * }
     */
    public static function for(User $user): array
    {
        $pathCourses = Course::query()
            ->whereNotNull('sequence_order')
            ->where('type', 'course')
            ->where('is_published', true)
            ->orderBy('sequence_order')
            ->get();

        $coursesDone = $pathCourses
            ->filter(fn (Course $course): bool => CourseAccess::state($user, $course)['status'] === 'completed')
            ->count();

        $hoursAccepted = (float) $user->internshipEntries()
            ->where('status', 'accepted')
            ->sum('hours');

        $supervisionPresent = SupervisionSignup::query()
            ->where('user_id', $user->id)
            ->where('attendance', 'present')
            ->whereNull('cancelled_at')
            ->count();

        $workshopDone = WorkshopCompletion::where('user_id', $user->id)->exists();

        return [
            'courses_done' => $coursesDone,
            'courses_total' => $pathCourses->count(),
            'hours_accepted' => self::formatDecimal($hoursAccepted),
            'supervision_present' => $supervisionPresent,
            'workshop_done' => $workshopDone,
            'reliability_percent' => self::reliabilityPercent($user),
        ];
    }

    /**
     * Total active time divided by total duration across the measurable lessons
     * the user has completed (H07 rule) — long lessons weigh more than short ones.
     * Lessons still in progress and lessons with duration_seconds = 0 are excluded.
     * Null when the user has no measurable completed lesson.
     */
    public static function reliabilityPercent(User $user): ?int
    {
        $rows = $user->lessonProgress()
            ->join('lessons', 'lessons.id', '=', 'lesson_progress.lesson_id')
            ->where('lesson_progress.is_completed', true)
            ->where('lessons.duration_seconds', '>', 0)
            ->get([
                'lesson_progress.active_seconds',
                'lessons.duration_seconds',
            ]);

        if ($rows->isEmpty()) {
            return null;
        }

        $activeSeconds = (int) $rows->sum('active_seconds');
        $durationSeconds = (int) $rows->sum('duration_seconds');

        return (int) round(min(100, $activeSeconds / $durationSeconds * 100));
    }

    /**
     * Decimal formatted for the API contract ("41.5", "72") — decimals travel as strings.
     */
    public static function formatDecimal(float $value): string
    {
        $formatted = rtrim(rtrim(number_format($value, 1, '.', ''), '0'), '.');

        return $formatted === '' ? '0' : $formatted;
    }
}
