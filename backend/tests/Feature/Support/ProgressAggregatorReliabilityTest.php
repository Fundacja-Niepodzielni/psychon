<?php

namespace Tests\Feature\Support;

use App\Models\Course;
use App\Models\Lesson;
use App\Models\LessonProgress;
use App\Models\User;
use App\Support\ProgressAggregator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The ONLY reliability implementation (ProgressAggregator::reliabilityPercent —
 * frozen signature). H07 rule: sum(active_seconds) / sum(duration_seconds)
 * across measurable COMPLETED lessons, so long lessons weigh more than short ones.
 */
class ProgressAggregatorReliabilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_weighs_lessons_by_duration_instead_of_averaging_percentages(): void
    {
        $user = User::factory()->create();

        // 100% of a 60 s lesson + 20% of a 3600 s lesson.
        // Ratio of sums = 780/3660 ≈ 21%; an average of percentages would say 60%.
        $this->completeLesson($user, durationSeconds: 60, activeSeconds: 60);
        $this->completeLesson($user, durationSeconds: 3600, activeSeconds: 720);

        $this->assertSame(21, ProgressAggregator::reliabilityPercent($user));
    }

    public function test_ignores_lessons_that_are_not_completed(): void
    {
        $user = User::factory()->create();

        $this->completeLesson($user, durationSeconds: 1800, activeSeconds: 1440); // 80%
        $this->openLesson($user, durationSeconds: 1800, activeSeconds: 0);        // opened, still in progress

        $this->assertSame(80, ProgressAggregator::reliabilityPercent($user));
    }

    public function test_ignores_completed_lessons_without_a_measurable_duration(): void
    {
        $user = User::factory()->create();

        $this->completeLesson($user, durationSeconds: 1800, activeSeconds: 900); // 50%
        $this->completeLesson($user, durationSeconds: 0, activeSeconds: 300);    // not measurable

        $this->assertSame(50, ProgressAggregator::reliabilityPercent($user));
    }

    public function test_is_null_without_any_measurable_completed_lesson(): void
    {
        $user = User::factory()->create();

        $this->openLesson($user, durationSeconds: 1800, activeSeconds: 600);
        $this->completeLesson($user, durationSeconds: 0, activeSeconds: 300);

        $this->assertNull(ProgressAggregator::reliabilityPercent($user));
    }

    public function test_is_capped_at_one_hundred_percent(): void
    {
        $user = User::factory()->create();

        // active_seconds only ever grows, so it can overshoot the declared duration.
        $this->completeLesson($user, durationSeconds: 600, activeSeconds: 900);

        $this->assertSame(100, ProgressAggregator::reliabilityPercent($user));
    }

    private function completeLesson(User $user, int $durationSeconds, int $activeSeconds): void
    {
        $this->progress($user, $durationSeconds, $activeSeconds, isCompleted: true);
    }

    private function openLesson(User $user, int $durationSeconds, int $activeSeconds): void
    {
        $this->progress($user, $durationSeconds, $activeSeconds, isCompleted: false);
    }

    private function progress(User $user, int $durationSeconds, int $activeSeconds, bool $isCompleted): void
    {
        $course = Course::firstOrCreate(
            ['slug' => 'rzetelnosc-test'],
            ['title' => 'Kurs testowy', 'is_published' => true]
        );

        $sequenceOrder = $course->lessons()->count() + 1;

        $lesson = Lesson::create([
            'course_id' => $course->id,
            'title' => "Lekcja {$sequenceOrder}",
            'sequence_order' => $sequenceOrder,
            'duration_seconds' => $durationSeconds,
        ]);

        LessonProgress::create([
            'user_id' => $user->id,
            'lesson_id' => $lesson->id,
            'watched_seconds' => $activeSeconds,
            'active_seconds' => $activeSeconds,
            'open_count' => 1,
            'last_activity_at' => now(),
            'is_completed' => $isCompleted,
            'completed_at' => $isCompleted ? now() : null,
        ]);
    }
}
