<?php

namespace Tests\Feature\H07;

use App\Models\AuditLogEntry;
use App\Models\Course;
use App\Models\Edition;
use App\Models\EmailMessage;
use App\Models\Lesson;
use App\Models\LessonProgress;
use App\Models\Notification;
use App\Models\SupervisorAssignment;
use App\Models\User;
use App\Services\H07\AdminReliabilityQuery;
use App\Support\ProgressAggregator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ReliabilityApiTest extends TestCase
{
    use RefreshDatabase;

    private Edition $edition;

    private User $admin;

    private User $instructor;

    private Course $course;

    protected function setUp(): void
    {
        parent::setUp();

        $this->edition = Edition::factory()->create(['reliability_threshold' => 60]);
        $this->admin = User::factory()->role('project_manager')->create([
            'edition_id' => $this->edition->id,
        ]);
        $this->instructor = User::factory()->role('instructor')->create([
            'edition_id' => $this->edition->id,
        ]);
        $this->course = Course::create([
            'title' => 'Kurs testowy',
            'slug' => 'kurs-testowy',
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => 1,
            'edition_id' => $this->edition->id,
            'is_published' => true,
        ]);
    }

    public function test_aggregator_uses_weighted_completed_lessons_only(): void
    {
        $user = $this->participant('weighted@demo.pl');
        $short = $this->lesson('Krótka', 100, 1);
        $long = $this->lesson('Długa', 300, 2);
        $unfinished = $this->lesson('Nieukończona', 100, 3);

        $this->progress($user, $short, 50, true);
        $this->progress($user, $long, 30, true);
        $this->progress($user, $unfinished, 100, false);

        $this->assertSame(20, ProgressAggregator::reliabilityPercent($user));
        $this->assertSame(20, ProgressAggregator::for($user)['reliability_percent']);
    }

    public function test_admin_list_is_ascending_paginated_and_uses_official_types(): void
    {
        $low = $this->participant('low@demo.pl', 'Ala', 'Niska');
        $high = $this->participant('high@demo.pl', 'Ela', 'Wysoka');
        $empty = $this->participant('empty@demo.pl', 'Zenon', 'Bez wyniku');
        $lesson = $this->lesson('Pomiar', 100, 1);

        $this->progress($low, $lesson, 15, true);
        $this->progress($high, $lesson, 85, true);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/v1/admin/reliability?per_page=50');

        $response->assertOk()
            ->assertJsonPath('data.0.id', $low->id)
            ->assertJsonPath('data.0.reliability_percent', '15')
            ->assertJsonPath('data.0.below_threshold', true)
            ->assertJsonPath('data.1.id', $high->id)
            ->assertJsonPath('data.1.reliability_percent', '85')
            ->assertJsonPath('data.1.below_threshold', false)
            ->assertJsonPath('data.2.id', $empty->id)
            ->assertJsonPath('data.2.reliability_percent', null)
            ->assertJsonPath('meta.total', 3)
            ->assertJsonPath('meta.current_page', 1);

        $this->assertSame(
            ProgressAggregator::for($low)['reliability_percent'],
            (int) $response->json('data.0.reliability_percent'),
        );
    }

    public function test_admin_details_use_aggregator_and_expose_only_completed_lesson_diagnostics(): void
    {
        $user = $this->participant('details@demo.pl');
        $below = $this->lesson('Poniżej progu', 100, 1);
        $above = $this->lesson('Powyżej progu', 100, 2);
        $unfinished = $this->lesson('Nieukończona', 100, 3);
        $this->progress($user, $below, 20, true, openCount: 4);
        $this->progress($user, $above, 80, true, openCount: 2);
        $this->progress($user, $unfinished, 10, false);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->getJson("/api/v1/admin/reliability/{$user->id}");

        $response->assertOk()
            ->assertJsonPath('data.reliability_percent', '50')
            ->assertJsonPath('data.below_threshold', true)
            ->assertJsonCount(2, 'data.lessons')
            ->assertJsonPath('data.lessons.0.title', 'Poniżej progu')
            ->assertJsonPath('data.lessons.0.active_seconds', 20)
            ->assertJsonPath('data.lessons.0.duration_seconds', 100)
            ->assertJsonPath('data.lessons.0.open_count', 4)
            ->assertJsonPath('data.lessons.0.below_threshold', true)
            ->assertJsonMissing(['title' => 'Nieukończona']);

        $this->assertSame(
            ProgressAggregator::for($user)['reliability_percent'],
            (int) $response->json('data.reliability_percent'),
        );
    }

    public function test_authentication_and_roles_are_enforced_for_every_endpoint(): void
    {
        $user = $this->participant('roles@demo.pl');

        $this->getJson('/api/v1/admin/reliability')
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
        $this->getJson("/api/v1/admin/reliability/{$user->id}")
            ->assertStatus(401);
        $this->getJson('/api/v1/instructor/reliability')
            ->assertStatus(401);

        $this->actingAs($this->instructor, 'sanctum')
            ->getJson('/api/v1/admin/reliability')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
        $this->actingAs($this->instructor, 'sanctum')
            ->getJson("/api/v1/admin/reliability/{$user->id}")
            ->assertStatus(403)
            ->assertJsonMissing(['email' => $user->email]);

        $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/v1/instructor/reliability')
            ->assertStatus(403);
        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/instructor/reliability')
            ->assertStatus(403);
    }

    public function test_instructor_sees_only_current_members_from_their_own_group(): void
    {
        $otherInstructor = User::factory()->role('instructor')->create([
            'edition_id' => $this->edition->id,
        ]);
        $own = $this->participant('own@demo.pl');
        $foreign = $this->participant('foreign@demo.pl');
        $historical = $this->participant('historical@demo.pl');
        $lesson = $this->lesson('Pomiar', 100, 1);
        $this->progress($own, $lesson, 40, true);
        $this->progress($foreign, $lesson, 10, true);
        $this->progress($historical, $lesson, 5, true);

        SupervisorAssignment::create([
            'volunteer_id' => $own->id,
            'supervisor_id' => $this->instructor->id,
            'assigned_at' => now(),
        ]);
        SupervisorAssignment::create([
            'volunteer_id' => $foreign->id,
            'supervisor_id' => $otherInstructor->id,
            'assigned_at' => now(),
        ]);
        SupervisorAssignment::create([
            'volunteer_id' => $historical->id,
            'supervisor_id' => $this->instructor->id,
            'assigned_at' => now()->subMonth(),
            'unassigned_at' => now()->subDay(),
        ]);

        $response = $this->actingAs($this->instructor, 'sanctum')
            ->getJson('/api/v1/instructor/reliability');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $own->id)
            ->assertJsonPath('data.0.reliability_percent', '40')
            ->assertJsonMissing(['id' => $foreign->id])
            ->assertJsonMissing(['id' => $historical->id])
            ->assertJsonMissing(['email' => $own->email]);
    }

    public function test_threshold_changes_are_immediate_and_equal_is_not_below(): void
    {
        $user = $this->participant('threshold@demo.pl');
        $lesson = $this->lesson('Pomiar', 100, 1);
        $this->progress($user, $lesson, 50, true);

        $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/v1/admin/reliability')
            ->assertJsonPath('data.0.reliability_percent', '50')
            ->assertJsonPath('data.0.below_threshold', true);

        $this->actingAs($this->admin, 'sanctum')
            ->patchJson('/api/v1/admin/edition', ['reliability_threshold' => 50])
            ->assertOk()
            ->assertJsonPath('data.reliability_threshold', 50);

        $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/v1/admin/reliability')
            ->assertJsonPath('data.0.reliability_percent', '50')
            ->assertJsonPath('data.0.below_threshold', false);
    }

    public function test_admin_query_uses_one_reliability_query_per_participant(): void
    {
        $lesson = $this->lesson('Pomiar', 100, 1);

        foreach (range(1, 3) as $index) {
            $user = $this->participant("queries-{$index}@demo.pl");
            $this->progress($user, $lesson, $index * 10, true);
        }

        DB::flushQueryLog();
        DB::enableQueryLog();

        $paginator = app(AdminReliabilityQuery::class)->paginate(1, 100);
        $queryCount = count(DB::getQueryLog());

        DB::disableQueryLog();

        $this->assertCount(3, $paginator->items());
        $this->assertLessThanOrEqual(7, $queryCount);
    }

    public function test_empty_results_not_found_validation_and_no_side_effects(): void
    {
        $before = [
            AuditLogEntry::count(),
            Notification::count(),
            EmailMessage::count(),
        ];

        $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/v1/admin/reliability')
            ->assertOk()
            ->assertJsonCount(0, 'data')
            ->assertJsonPath('meta.total', 0);
        $this->actingAs($this->instructor, 'sanctum')
            ->getJson('/api/v1/instructor/reliability')
            ->assertOk()
            ->assertJsonCount(0, 'data');
        $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/v1/admin/reliability/999999')
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
        $this->actingAs($this->admin, 'sanctum')
            ->getJson('/api/v1/admin/reliability?filter=forbidden')
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
        $this->actingAs($this->instructor, 'sanctum')
            ->getJson('/api/v1/instructor/reliability?supervisor_id=1')
            ->assertStatus(422);

        $this->assertSame($before, [
            AuditLogEntry::count(),
            Notification::count(),
            EmailMessage::count(),
        ]);
    }

    private function participant(
        string $email,
        string $firstName = 'Osoba',
        string $lastName = 'Testowa',
    ): User {
        return User::factory()->create([
            'edition_id' => $this->edition->id,
            'role' => 'volunteer',
            'status' => 'active',
            'email' => $email,
            'first_name' => $firstName,
            'last_name' => $lastName,
        ]);
    }

    private function lesson(string $title, int $duration, int $order): Lesson
    {
        return Lesson::create([
            'course_id' => $this->course->id,
            'title' => $title,
            'duration_seconds' => $duration,
            'sequence_order' => $order,
        ]);
    }

    private function progress(
        User $user,
        Lesson $lesson,
        int $activeSeconds,
        bool $completed,
        int $openCount = 1,
    ): LessonProgress {
        return LessonProgress::create([
            'user_id' => $user->id,
            'lesson_id' => $lesson->id,
            'watched_seconds' => $activeSeconds,
            'active_seconds' => $activeSeconds,
            'open_count' => $openCount,
            'last_activity_at' => now(),
            'is_completed' => $completed,
            'completed_at' => $completed ? now() : null,
        ]);
    }
}
