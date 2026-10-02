<?php

namespace App\Support;

use App\Models\Course;
use App\Models\Lesson;
use App\Models\SupervisionSignup;
use App\Models\TestAttempt;
use App\Models\User;
use App\Models\WorkshopCompletion;
use App\Services\Lessons\LessonCompletionRule;

/**
 * The single source of progress numbers (person card, dashboard, report,
 * certificate conditions — H13/H18/H19/H20). FROZEN SIGNATURE.
 */
final class ProgressAggregator
{
    /** Kolumny lekcji, z których `LessonCompletionRule` rozpoznaje nagranie i czas trwania. */
    public const array MEASURABLE_LESSON_COLUMNS = [
        'duration_seconds', 'video_provider_id', 'video_pending_id', 'video_status', 'video_status_at',
    ];

    /**
     * @return array{
     *     courses_done: int,
     *     courses_total: int,
     *     hours_accepted: string,
     *     supervision_present: int,
     *     workshop_done: bool,
     *     reliability_percent: int|null,
     *     path_tests_passed: int,
     *     path_tests_total: int,
     * }
     *
     * `path_tests_passed` / `path_tests_total` dopisane tutaj (nie na osobnej
     * ścieżce): zaliczone testy jako osobna liczba muszą liczyć się na TYM
     * SAMYM zbiorze ścieżki co `courses_total`, żeby nie rozjechać się z kartą
     * osoby. `path_tests_total` liczy tylko kursy ścieżki, które MAJĄ test —
     * kurs bez testu nie wchodzi, bo `CourseAccess::testPassed()` zwraca dla
     * niego `true` z definicji i zawyżyłby `path_tests_passed` ponad liczbę
     * realnie zdanych testów. Przedrostek `path_` odróżnia tę parę od
     * `passedTestsCount()` niżej w tym pliku: tamta liczy inną wielkość
     * (różne testy zaliczone choć jedną próbą, na całej platformie, bez
     * mianownika); pole `tests_passed` w wierszu osoby raportu H20 pochodzi
     * właśnie z `passedTestsCount()`, nie stąd.
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

        $coursesWithTest = $pathCourses->filter(fn (Course $course): bool => $course->test !== null);

        $testsPassed = $coursesWithTest
            ->filter(fn (Course $course): bool => CourseAccess::testPassed($user, $course))
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
            'path_tests_passed' => $testsPassed,
            'path_tests_total' => $coursesWithTest->count(),
        ];
    }

    /**
     * Liczba różnych testów zaliczonych przynajmniej jedną próbą (H13 —
     * „zaliczone testy jako osobna liczba"). NOWA metoda, `for()` bez zmian —
     * `courses_done` w `for()` nadal scala etapy i testy w jedno pole.
     */
    public static function passedTestsCount(User $user): int
    {
        return TestAttempt::query()
            ->where('user_id', $user->id)
            ->where('passed', true)
            ->distinct('test_id')
            ->count('test_id');
    }

    /**
     * Total active time divided by total duration across the measurable lessons
     * the user has completed (H07 rule) — long lessons weigh more than short ones.
     * Measurable = has a recording and duration_seconds > 0 (`LessonCompletionRule::isMeasurable`).
     * Lessons still in progress, lessons without a recording and lessons with
     * duration_seconds = 0 are excluded.
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
                ...array_map(fn (string $column): string => 'lessons.'.$column, self::MEASURABLE_LESSON_COLUMNS),
            ])
            ->filter(fn ($row): bool => LessonCompletionRule::isMeasurable((new Lesson)->forceFill($row->getAttributes())));

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
