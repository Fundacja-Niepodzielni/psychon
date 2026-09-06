<?php

namespace Tests\Feature\H10;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

/**
 * Pakiet H10 · reset limitu podejść — kryterium 4 (opiekun z powodem
 * umożliwia nowe podejście; audyt `attempts.reset`).
 */
class ResetAttemptsTest extends TestPackageCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create(['role' => 'project_manager']);
    }

    public function test_reset_requires_a_reason(): void
    {
        $test = $this->makeTest(questions: 3);
        $user = $this->volunteer();
        Sanctum::actingAs($this->admin());

        $this->postJson("/api/v1/admin/tests/{$test->id}/users/{$user->id}/reset-attempts", [])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.reason.0', 'Podaj powód resetu limitu podejść.');
    }

    public function test_reset_clears_attempts_and_allows_a_new_one(): void
    {
        $test = $this->makeTest(questions: 10);
        $user = $this->volunteer();

        Sanctum::actingAs($user);
        for ($i = 1; $i <= 3; $i++) {
            $this->postJson("/api/v1/tests/{$test->id}/attempts", [
                'answers' => $this->answersFor($test, 2),
            ])->assertCreated();
        }
        $this->postJson("/api/v1/tests/{$test->id}/attempts", [
            'answers' => $this->answersFor($test, 2),
        ])->assertStatus(403)->assertJsonPath('error.code', 'attempts_exhausted');

        $admin = $this->admin();
        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/admin/tests/{$test->id}/users/{$user->id}/reset-attempts", [
            'reason' => 'Problem techniczny w trakcie 3. podejścia.',
        ])->assertOk()
            ->assertJsonPath('data.cleared', 3)
            ->assertJsonPath('data.attempts_used', 0);

        $this->assertDatabaseCount('test_attempts', 0);
        $this->assertDatabaseHas('audit_log', [
            'action' => 'attempts.reset',
            'actor_id' => $admin->id,
            'subject_id' => $user->id,
        ]);

        // Nowe podejście znów możliwe, numeracja od 1.
        Sanctum::actingAs($user);
        $this->postJson("/api/v1/tests/{$test->id}/attempts", [
            'answers' => $this->answersFor($test, 10),
        ])->assertCreated()
            ->assertJsonPath('data.attempt_number', 1)
            ->assertJsonPath('data.passed', true);
    }

    public function test_reset_is_closed_to_non_admins(): void
    {
        $test = $this->makeTest(questions: 3);
        $user = $this->volunteer();
        Sanctum::actingAs($this->volunteer());

        $this->postJson("/api/v1/admin/tests/{$test->id}/users/{$user->id}/reset-attempts", [
            'reason' => 'próba obejścia',
        ])->assertStatus(403);
    }
}
