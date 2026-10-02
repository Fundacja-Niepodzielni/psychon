<?php

namespace Tests\Feature\H06;

use App\Models\Course;
use App\Models\Edition;
use App\Models\Lesson;
use App\Models\LessonProgress;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Ukończenie lekcji zależy od stanu nagrania:
 *  - bez nagrania — od razu do ukończenia (nie ma czego oglądać),
 *  - nagranie w przygotowaniu albo z błędem, bez gotowego — nie do ukończenia,
 *  - gotowe albo nieustalone (zastane) — jak dotąd: próg czasu aktywnego.
 *
 * Stan nagrania pochodzi z tej samej reguły, którą odczyt lekcji liczy
 * `video_status` (`LessonRecording::participantStatus`); żadne żądanie nie
 * opuszcza procesu.
 */
class LessonWithoutRecordingTest extends TestCase
{
    use RefreshDatabase;

    private const string RECORDING = 'mock-nagranie-654';

    private const string PENDING = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

    protected function setUp(): void
    {
        parent::setUp();

        // Atrapa dostawcy nagrań: żadne żądanie nie opuszcza procesu.
        Http::fake();
    }

    /**
     * Czas trwania 600 s i próg 60% dają wymagany czas aktywny 360 s.
     *
     * @return array<string, array{
     *     played: ?string, pending: ?string, status: ?string, duration: int, active: int,
     *     videoStatus: string, completable: bool, completeStatus: int
     * }>
     */
    public static function legs(): array
    {
        return [
            'no recording, positive duration, no active time' => [
                'played' => null, 'pending' => null, 'status' => null, 'duration' => 600, 'active' => 0,
                'videoStatus' => 'none', 'completable' => true, 'completeStatus' => 200,
            ],
            'no recording, zero duration' => [
                'played' => null, 'pending' => null, 'status' => null, 'duration' => 0, 'active' => 0,
                'videoStatus' => 'none', 'completable' => true, 'completeStatus' => 200,
            ],
            'recording on its way, uploading' => [
                'played' => null, 'pending' => self::PENDING, 'status' => 'uploading', 'duration' => 600, 'active' => 600,
                'videoStatus' => 'uploading', 'completable' => false, 'completeStatus' => 422,
            ],
            'recording on its way, processing' => [
                'played' => null, 'pending' => self::PENDING, 'status' => 'processing', 'duration' => 600, 'active' => 600,
                'videoStatus' => 'processing', 'completable' => false, 'completeStatus' => 422,
            ],
            'existing recording found processing' => [
                'played' => self::RECORDING, 'pending' => null, 'status' => 'processing', 'duration' => 600, 'active' => 600,
                'videoStatus' => 'processing', 'completable' => false, 'completeStatus' => 422,
            ],
            'recording on its way, error' => [
                'played' => null, 'pending' => self::PENDING, 'status' => 'error', 'duration' => 600, 'active' => 600,
                'videoStatus' => 'error', 'completable' => false, 'completeStatus' => 422,
            ],
            'existing recording in error' => [
                'played' => self::RECORDING, 'pending' => null, 'status' => 'error', 'duration' => 600, 'active' => 600,
                'videoStatus' => 'error', 'completable' => false, 'completeStatus' => 422,
            ],
            'ready, below the threshold' => [
                'played' => self::RECORDING, 'pending' => null, 'status' => 'ready', 'duration' => 600, 'active' => 359,
                'videoStatus' => 'ready', 'completable' => false, 'completeStatus' => 422,
            ],
            'ready, at the threshold' => [
                'played' => self::RECORDING, 'pending' => null, 'status' => 'ready', 'duration' => 600, 'active' => 360,
                'videoStatus' => 'ready', 'completable' => true, 'completeStatus' => 200,
            ],
            'unknown state of an existing recording, below the threshold' => [
                'played' => self::RECORDING, 'pending' => null, 'status' => null, 'duration' => 600, 'active' => 359,
                'videoStatus' => 'ready', 'completable' => false, 'completeStatus' => 422,
            ],
            'unknown state of an existing recording, at the threshold' => [
                'played' => self::RECORDING, 'pending' => null, 'status' => null, 'duration' => 600, 'active' => 360,
                'videoStatus' => 'ready', 'completable' => true, 'completeStatus' => 200,
            ],
            'ready recording with a replacement on its way, below the threshold' => [
                'played' => self::RECORDING, 'pending' => self::PENDING, 'status' => 'uploading', 'duration' => 600, 'active' => 100,
                'videoStatus' => 'ready', 'completable' => false, 'completeStatus' => 422,
            ],
            'ready, zero duration' => [
                'played' => self::RECORDING, 'pending' => null, 'status' => 'ready', 'duration' => 0, 'active' => 0,
                'videoStatus' => 'ready', 'completable' => false, 'completeStatus' => 422,
            ],
        ];
    }

    #[DataProvider('legs')]
    public function test_the_read_the_progress_write_and_the_completion_agree_on_every_leg(
        ?string $played,
        ?string $pending,
        ?string $status,
        int $duration,
        int $active,
        string $videoStatus,
        bool $completable,
        int $completeStatus,
    ): void {
        $lesson = $this->lessonWith($played, $pending, $status, $duration);
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');
        $this->progressWith($user, $lesson, $active);

        $this->getJson("/api/v1/lessons/{$lesson->id}")
            ->assertOk()
            ->assertJsonPath('data.video_status', $videoStatus)
            ->assertJsonPath('data.completable', $completable)
            ->assertJsonPath('data.is_completed', false);

        $this->postJson("/api/v1/lessons/{$lesson->id}/progress", ['watched_delta' => 0, 'active_delta' => 0])
            ->assertOk()
            ->assertJsonPath('data.completable', $completable);

        $response = $this->postJson("/api/v1/lessons/{$lesson->id}/complete")->assertStatus($completeStatus);

        if ($completeStatus === 200) {
            $response->assertJsonPath('data.is_completed', true);
            $this->assertNotNull($response->json('data.completed_at'));
            $this->assertTrue((bool) LessonProgress::where('user_id', $user->id)->where('lesson_id', $lesson->id)->value('is_completed'));
        } else {
            $response->assertJsonPath('error.code', 'not_enough_active_time');
            $this->assertFalse((bool) LessonProgress::where('user_id', $user->id)->where('lesson_id', $lesson->id)->value('is_completed'));
        }

        Http::assertNothingSent();
    }

    public function test_a_lesson_without_a_recording_is_completable_before_any_progress_row_exists(): void
    {
        $lesson = $this->lessonWith(null, null, null, 900);
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');

        $this->assertSame(0, LessonProgress::where('user_id', $user->id)->count());

        $this->postJson("/api/v1/lessons/{$lesson->id}/complete")
            ->assertOk()
            ->assertJsonPath('data.is_completed', true);

        $row = LessonProgress::where('user_id', $user->id)->where('lesson_id', $lesson->id)->firstOrFail();
        $this->assertSame(0, (int) $row->active_seconds, 'Ukończenie lekcji bez nagrania nie wymyśla czasu aktywnego.');
    }

    public function test_a_lesson_gaining_a_recording_stops_being_completable_without_time(): void
    {
        $lesson = $this->lessonWith(null, null, null, 600);
        $this->actingAs($this->volunteer(), 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}")->assertOk()->assertJsonPath('data.completable', true);

        DB::table('lessons')->where('id', $lesson->id)->update([
            'video_pending_id' => self::PENDING,
            'video_status' => 'processing',
        ]);

        $this->getJson("/api/v1/lessons/{$lesson->id}")
            ->assertOk()
            ->assertJsonPath('data.video_status', 'processing')
            ->assertJsonPath('data.completable', false);

        $this->postJson("/api/v1/lessons/{$lesson->id}/complete")
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'not_enough_active_time');
    }

    public function test_completing_a_lesson_twice_is_idempotent_without_a_recording(): void
    {
        $lesson = $this->lessonWith(null, null, null, 600);
        $this->actingAs($this->volunteer(), 'keycloak');

        $first = $this->postJson("/api/v1/lessons/{$lesson->id}/complete")->assertOk()->json('data.completed_at');
        $second = $this->postJson("/api/v1/lessons/{$lesson->id}/complete")->assertOk()->json('data.completed_at');

        $this->assertSame($first, $second);
    }

    private function lessonWith(?string $played, ?string $pending, ?string $status, int $duration): Lesson
    {
        $course = Course::create([
            'title' => 'Kurs 654 '.uniqid(),
            'slug' => 'kurs-654-'.uniqid(),
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => 1,
            'edition_id' => $this->edition()->id,
            'is_published' => true,
        ]);

        $lesson = Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lekcja 654',
            'sequence_order' => 1,
            'duration_seconds' => $duration,
        ]);

        DB::table('lessons')->where('id', $lesson->id)->update([
            'video_provider_id' => $played,
            'video_pending_id' => $pending,
            'video_status' => $status,
            'video_status_at' => $status === null ? null : now(),
        ]);

        return $lesson->fresh();
    }

    private function progressWith(User $user, Lesson $lesson, int $active): void
    {
        DB::table('lesson_progress')->insert([
            'user_id' => $user->id,
            'lesson_id' => $lesson->id,
            'position_seconds' => 0,
            'watched_seconds' => $active,
            'active_seconds' => $active,
            'open_count' => 0,
            'last_activity_at' => null,
            'is_completed' => false,
            'completed_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function edition(): Edition
    {
        return Edition::query()->firstWhere('status', 'active') ?? Edition::create([
            'name' => 'Edycja 654',
            'starts_at' => '2026-10-01',
            'ends_at' => '2027-09-30',
            'seats_limit' => 40,
            'test_pass_threshold' => 80,
            'test_attempts_limit' => 3,
            'internship_hours_required' => 72,
            'supervision_required_count' => 6,
            'reliability_threshold' => 60,
            'lesson_completion_percent' => 60,
            'status' => 'active',
        ]);
    }

    private function volunteer(): User
    {
        return User::factory()->create(['role' => 'volunteer', 'product_group' => 'psychon']);
    }
}
