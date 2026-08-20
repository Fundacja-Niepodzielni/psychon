<?php

namespace App\Support;

use App\Models\Course;
use App\Models\LessonProgress;
use App\Models\TestAttempt;
use App\Models\User;

/**
 * The ONLY implementation of the sequential unlock rule (data model §2.4):
 * course `n` in the path is available when course `n-1` has all lessons
 * completed AND its test passed. Courses with sequence_order = null are
 * outside the sequence and always available (invited courses, webinars).
 * FROZEN SIGNATURE — packages must not re-implement this rule.
 */
final class CourseAccess
{
    /**
     * @return array{status: 'locked'|'in_progress'|'completed', missing: list<string>, required_course_id?: int}
     */
    public static function state(User $user, Course $course): array
    {
        if ($course->sequence_order !== null) {
            $previous = Course::query()
                ->whereNotNull('sequence_order')
                ->where('sequence_order', '<', $course->sequence_order)
                ->where('type', 'course')
                ->where('is_published', true)
                ->orderByDesc('sequence_order')
                ->first();

            if ($previous !== null) {
                $missing = [];

                if (! self::allLessonsCompleted($user, $previous)) {
                    $missing[] = 'lessons';
                }

                if (! self::testPassed($user, $previous)) {
                    $missing[] = 'test';
                }

                if ($missing !== []) {
                    return [
                        'status' => 'locked',
                        'missing' => $missing,
                        'required_course_id' => $previous->id,
                    ];
                }
            }
        }

        $lessonsDone = self::allLessonsCompleted($user, $course);
        $testDone = self::testPassed($user, $course);

        if ($lessonsDone && $testDone) {
            return ['status' => 'completed', 'missing' => []];
        }

        return [
            'status' => 'in_progress',
            'missing' => array_values(array_filter([
                $lessonsDone ? null : 'lessons',
                $testDone ? null : 'test',
            ])),
        ];
    }

    /**
     * Percentage of completed lessons (for course lists — H05).
     */
    public static function progressPercent(User $user, Course $course): int
    {
        $lessonIds = $course->lessons()->pluck('id');

        if ($lessonIds->isEmpty()) {
            return 0;
        }

        $completed = LessonProgress::where('user_id', $user->id)
            ->whereIn('lesson_id', $lessonIds)
            ->where('is_completed', true)
            ->count();

        return (int) round($completed / $lessonIds->count() * 100);
    }

    private static function allLessonsCompleted(User $user, Course $course): bool
    {
        $lessonIds = $course->lessons()->pluck('id');

        if ($lessonIds->isEmpty()) {
            return false;
        }

        $completed = LessonProgress::where('user_id', $user->id)
            ->whereIn('lesson_id', $lessonIds)
            ->where('is_completed', true)
            ->count();

        return $completed === $lessonIds->count();
    }

    /**
     * A course without a test has the test condition satisfied by definition.
     */
    private static function testPassed(User $user, Course $course): bool
    {
        $test = $course->test;

        if ($test === null) {
            return true;
        }

        return TestAttempt::where('user_id', $user->id)
            ->where('test_id', $test->id)
            ->where('passed', true)
            ->exists();
    }
}
