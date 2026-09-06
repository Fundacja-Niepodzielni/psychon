<?php

namespace Tests\Feature\H10;

use App\Models\AuditLogEntry;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

/**
 * Pakiet H10 · limit podejść — kryterium 2 (czwarte podejście → 403) oraz
 * audyt `attempt.finished` i powiadomienie `attempt.failed_final`.
 */
class AttemptLimitTest extends TestPackageCase
{
    use RefreshDatabase;

    public function test_fourth_attempt_is_rejected_with_attempts_exhausted(): void
    {
        $test = $this->makeTest(questions: 10);
        $user = $this->volunteer();
        Sanctum::actingAs($user);

        for ($i = 1; $i <= 3; $i++) {
            $this->postJson("/api/v1/tests/{$test->id}/attempts", [
                'answers' => $this->answersFor($test, 3), // 30% — nie zalicza
            ])->assertCreated()->assertJsonPath('data.attempt_number', $i);
        }

        $this->postJson("/api/v1/tests/{$test->id}/attempts", [
            'answers' => $this->answersFor($test, 3),
        ])->assertStatus(403)->assertJsonPath('error.code', 'attempts_exhausted');

        $this->assertDatabaseCount('test_attempts', 3);
    }

    public function test_every_finished_attempt_is_audited(): void
    {
        $test = $this->makeTest(questions: 10);
        $user = $this->volunteer();
        Sanctum::actingAs($user);

        $this->postJson("/api/v1/tests/{$test->id}/attempts", [
            'answers' => $this->answersFor($test, 9),
        ])->assertCreated();

        $entry = AuditLogEntry::where('action', 'attempt.finished')->firstOrFail();
        $this->assertSame($user->id, $entry->actor_id);
        $this->assertSame(90, $entry->details['score_percent']);
        $this->assertTrue($entry->details['passed']);
    }

    public function test_final_failed_attempt_notifies_project_managers(): void
    {
        $manager = User::factory()->create(['role' => 'project_manager']);
        User::factory()->create(['role' => 'project_manager']); // drugi opiekun
        $test = $this->makeTest(questions: 10);
        $user = $this->volunteer();
        Sanctum::actingAs($user);

        for ($i = 1; $i <= 3; $i++) {
            $this->postJson("/api/v1/tests/{$test->id}/attempts", [
                'answers' => $this->answersFor($test, 2),
            ])->assertCreated();
        }

        $this->assertSame(
            2,
            Notification::where('type', 'attempt.failed_final')->count(),
        );
        $this->assertDatabaseHas('notifications', [
            'user_id' => $manager->id,
            'type' => 'attempt.failed_final',
        ]);
    }

    public function test_no_final_notification_when_the_last_attempt_passes(): void
    {
        User::factory()->create(['role' => 'project_manager']);
        $test = $this->makeTest(questions: 10);
        $user = $this->volunteer();
        Sanctum::actingAs($user);

        $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => $this->answersFor($test, 2)])->assertCreated();
        $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => $this->answersFor($test, 2)])->assertCreated();
        $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => $this->answersFor($test, 10)])->assertCreated();

        $this->assertSame(0, Notification::where('type', 'attempt.failed_final')->count());
    }

    public function test_history_lists_own_attempts_oldest_first(): void
    {
        $test = $this->makeTest(questions: 10);
        $user = $this->volunteer();
        Sanctum::actingAs($user);

        $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => $this->answersFor($test, 4)])->assertCreated();
        $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => $this->answersFor($test, 8)])->assertCreated();

        $this->getJson("/api/v1/tests/{$test->id}/attempts")
            ->assertOk()
            ->assertJsonPath('data.0.attempt_number', 1)
            ->assertJsonPath('data.0.score_percent', 40)
            ->assertJsonPath('data.1.attempt_number', 2)
            ->assertJsonPath('data.1.passed', true)
            ->assertJsonPath('meta.extra.attempts_limit', 3);
    }

    public function test_history_hides_other_users_attempts(): void
    {
        $test = $this->makeTest(questions: 10);
        $other = $this->volunteer();
        Sanctum::actingAs($other);
        $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => $this->answersFor($test, 4)])->assertCreated();

        Sanctum::actingAs($this->volunteer());
        $this->getJson("/api/v1/tests/{$test->id}/attempts")
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }
}
