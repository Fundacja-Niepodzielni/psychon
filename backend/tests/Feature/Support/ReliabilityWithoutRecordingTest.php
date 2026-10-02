<?php

namespace Tests\Feature\Support;

use App\Models\Course;
use App\Models\Edition;
use App\Models\Lesson;
use App\Models\LessonProgress;
use App\Models\User;
use App\Support\ProgressAggregator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Lekcja bez nagrania nie ma mierzalnego czasu: nie wchodzi do rzetelności
 * nauki. Liczba ma jedno źródło (`ProgressAggregator::reliabilityPercent`),
 * a dwa miejsca pokazują ją osobno — `sum` sekcji `reliability` w
 * `GET /admin/users/{id}/number-sources` i `reliability_percent` w
 * `GET /admin/reliability/{userId}`. Wszystkie trzy muszą być równe.
 */
class ReliabilityWithoutRecordingTest extends TestCase
{
    use RefreshDatabase;

    private Edition $edition;

    private User $admin;

    private Course $course;

    private int $order = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->edition = Edition::factory()->create();
        $this->admin = User::factory()->role('project_manager')->create(['edition_id' => $this->edition->id]);
        $this->course = Course::create([
            'title' => 'Kurs rzetelnosci',
            'slug' => 'kurs-rzetelnosci-'.uniqid(),
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => 1,
            'edition_id' => $this->edition->id,
            'is_published' => true,
        ]);
    }

    private function person(): User
    {
        return User::factory()->create([
            'edition_id' => $this->edition->id,
            'role' => 'volunteer',
            'status' => 'active',
        ]);
    }

    private function lesson(bool $withRecording, int $duration, string $title = 'Lekcja'): Lesson
    {
        $this->order++;

        $lesson = Lesson::create([
            'course_id' => $this->course->id,
            'title' => $title.' '.$this->order,
            'sequence_order' => $this->order,
            'duration_seconds' => $duration,
            'video_provider_id' => $withRecording ? 'mock-rzetelnosc-'.$this->order : null,
        ]);

        if ($withRecording) {
            DB::table('lessons')->where('id', $lesson->id)->update(['video_status' => 'ready', 'video_status_at' => now()]);
        }

        return $lesson->fresh();
    }

    private function complete(User $user, Lesson $lesson, int $active): void
    {
        LessonProgress::create([
            'user_id' => $user->id,
            'lesson_id' => $lesson->id,
            'watched_seconds' => $active,
            'active_seconds' => $active,
            'open_count' => 1,
            'last_activity_at' => now(),
            'is_completed' => true,
            'completed_at' => now(),
        ]);
    }

    /**
     * @return array{aggregator: ?string, sources: array<string, mixed>, endpoint: array<string, mixed>}
     */
    private function threeNumbers(User $person): array
    {
        $aggregator = ProgressAggregator::reliabilityPercent($person);

        $sources = $this->actingAs($this->admin, 'keycloak')
            ->getJson("/api/v1/admin/users/{$person->id}/number-sources")
            ->assertOk()->json('data.reliability');

        $endpoint = $this->actingAs($this->admin, 'keycloak')
            ->getJson("/api/v1/admin/reliability/{$person->id}")
            ->assertOk()->json('data');

        return [
            'aggregator' => $aggregator === null ? null : (string) $aggregator,
            'sources' => $sources,
            'endpoint' => $endpoint,
        ];
    }

    /**
     * @param  array{aggregator: ?string, sources: array<string, mixed>, endpoint: array<string, mixed>}  $numbers
     */
    private function assertEqualNumbers(array $numbers, ?string $expected): void
    {
        $this->assertSame($expected, $numbers['aggregator']);
        $this->assertSame($expected, $numbers['sources']['sum']);
        $this->assertSame($expected, $numbers['endpoint']['reliability_percent']);
    }

    public function test_a_completed_lesson_without_a_recording_leaves_the_percent_unchanged(): void
    {
        $person = $this->person();
        $this->complete($person, $this->lesson(true, 100), 50);

        $before = $this->threeNumbers($person);
        $this->assertEqualNumbers($before, '50');

        $this->complete($person, $this->lesson(false, 200, 'Bez nagrania'), 0);

        $after = $this->threeNumbers($person);
        $this->assertEqualNumbers($after, '50');
        $this->assertSame($before['sources']['sum'], $after['sources']['sum']);
        $this->assertSame($before['endpoint']['reliability_percent'], $after['endpoint']['reliability_percent']);
    }

    public function test_the_rows_of_the_reliability_section_hold_no_lesson_without_a_recording(): void
    {
        $person = $this->person();
        $this->complete($person, $this->lesson(true, 100, 'Z nagraniem'), 80);
        $this->complete($person, $this->lesson(false, 300, 'Bez nagrania'), 10);

        $numbers = $this->threeNumbers($person);

        $this->assertEqualNumbers($numbers, '80');
        $this->assertSame(['Z nagraniem 1'], array_column($numbers['sources']['rows'], 'label'));
    }

    public function test_a_person_with_only_lessons_without_a_recording_has_no_result(): void
    {
        $person = $this->person();
        $this->complete($person, $this->lesson(false, 100), 5);
        $this->complete($person, $this->lesson(false, 900), 0);

        $numbers = $this->threeNumbers($person);

        $this->assertEqualNumbers($numbers, null);
        $this->assertSame([], $numbers['sources']['rows']);
        $this->assertFalse($numbers['endpoint']['below_threshold']);
    }

    public function test_people_with_recordings_keep_their_number(): void
    {
        $person = $this->person();
        // 100% z 60 s oraz 20% z 3600 s: 780 / 3660 = 21%.
        $this->complete($person, $this->lesson(true, 60), 60);
        $this->complete($person, $this->lesson(true, 3600), 720);

        $numbers = $this->threeNumbers($person);

        $this->assertEqualNumbers($numbers, '21');
        $this->assertTrue($numbers['endpoint']['below_threshold']);
        $this->assertCount(2, $numbers['sources']['rows']);
    }

    public function test_a_lesson_with_a_recording_and_no_duration_is_still_not_measurable(): void
    {
        $person = $this->person();
        $this->complete($person, $this->lesson(true, 0), 40);

        $this->assertEqualNumbers($this->threeNumbers($person), null);
    }

    public function test_a_recording_still_on_its_way_counts_as_a_recording(): void
    {
        $person = $this->person();
        $lesson = $this->lesson(false, 100);
        DB::table('lessons')->where('id', $lesson->id)->update([
            'video_pending_id' => 'mock-w-drodze-1',
            'video_status' => 'processing',
            'video_status_at' => now(),
        ]);
        $this->complete($person, $lesson, 40);

        $this->assertEqualNumbers($this->threeNumbers($person), '40');
    }

    public function test_the_filter_is_what_separates_the_old_number_from_the_new_one(): void
    {
        $person = $this->person();
        $this->complete($person, $this->lesson(true, 100), 90);
        $this->complete($person, $this->lesson(false, 300), 0);

        // Liczba z dawnej reguły (wszystkie ukończone lekcje z dodatnim czasem trwania).
        $old = DB::table('lesson_progress')
            ->join('lessons', 'lessons.id', '=', 'lesson_progress.lesson_id')
            ->where('lesson_progress.user_id', $person->id)
            ->where('lesson_progress.is_completed', true)
            ->where('lessons.duration_seconds', '>', 0)
            ->selectRaw('sum(lesson_progress.active_seconds) as a, sum(lessons.duration_seconds) as d')
            ->first();
        $oldPercent = (string) (int) round(min(100, $old->a / $old->d * 100));

        $this->assertSame('23', $oldPercent);
        $this->assertEqualNumbers($this->threeNumbers($person), '90');
    }
}
