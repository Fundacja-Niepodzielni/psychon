<?php

namespace Tests\Feature\H10;

use App\Models\AuditLogEntry;
use App\Models\Notification;
use App\Models\Test;
use App\Models\TestAttempt;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;

/**
 * Reset podejść przez administrację nie otwiera zaliczonego testu: 403
 * `test_already_passed`, nic nie skasowane, bez audytu. Niezaliczony test
 * resetuje się jak dotąd. Odmowa stoi po roli, 404 i walidacji powodu.
 */
class PassedTestResetTest extends TestPackageCase
{
    use RefreshDatabase;

    private function attempt(Test $test, array $answers): TestResponse
    {
        return $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => $answers]);
    }

    private function reset(Test $test, User $user, array $body = ['reason' => 'Problem techniczny w trakcie podejścia.']): TestResponse
    {
        return $this->postJson("/api/v1/admin/tests/{$test->id}/users/{$user->id}/reset-attempts", $body);
    }

    private function assertAlreadyPassed(TestResponse $response): void
    {
        $response->assertStatus(403)
            ->assertJsonPath('error.code', 'test_already_passed')
            ->assertJsonPath('error.message', 'Ten test jest już zaliczony.');
    }

    /** @return array{attempts: int, audit: int, notifications: int} */
    private function counts(): array
    {
        return [
            'attempts' => TestAttempt::count(),
            'audit' => AuditLogEntry::count(),
            'notifications' => Notification::count(),
        ];
    }

    public function test_reset_of_a_passed_test_is_refused_and_deletes_nothing(): void
    {
        $test = $this->makeTest(questions: 10);
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');
        $this->attempt($test, $this->answersForAttempt($test, 2, 1))->assertCreated();
        $this->attempt($test, $this->answersFor($test, 10))->assertCreated()->assertJsonPath('data.passed', true);
        $before = $this->counts();

        $this->actingAs(User::factory()->create(['role' => 'project_manager']), 'keycloak');
        $this->assertAlreadyPassed($this->reset($test, $user));

        $this->assertSame($before, $this->counts());
        $this->assertSame(2, TestAttempt::where('user_id', $user->id)->where('test_id', $test->id)->count());
        $this->assertSame(0, AuditLogEntry::where('action', 'attempts.reset')->count());

        $this->actingAs($user, 'keycloak');
        $this->getJson("/api/v1/courses/{$test->course->slug}/test")->assertJsonPath('data.passed', true);
    }

    public function test_reset_after_three_failures_still_clears_audits_and_allows_a_new_attempt(): void
    {
        $test = $this->makeTest(questions: 10);
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');
        foreach ([1, 2, 3] as $n) {
            $this->attempt($test, $this->answersForAttempt($test, 2, $n))->assertCreated();
        }

        $admin = User::factory()->create(['role' => 'project_manager']);
        $this->actingAs($admin, 'keycloak');
        $this->reset($test, $user)->assertOk()
            ->assertJsonPath('data.cleared', 3)
            ->assertJsonPath('data.attempts_used', 0);

        $this->assertSame(0, TestAttempt::where('user_id', $user->id)->count());
        $this->assertSame(1, AuditLogEntry::where('action', 'attempts.reset')->where('actor_id', $admin->id)->count());

        $this->actingAs($user, 'keycloak');
        $this->attempt($test, $this->answersFor($test, 10))->assertCreated()
            ->assertJsonPath('data.attempt_number', 1)
            ->assertJsonPath('data.passed', true);
    }

    public function test_reset_of_a_passed_test_keeps_earlier_refusals_first(): void
    {
        $test = $this->makeTest(questions: 10);
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');
        $this->attempt($test, $this->answersFor($test, 10))->assertCreated();

        // Rola spoza administracji: 403 forbidden, nie `test_already_passed`.
        $this->actingAs($this->volunteer(), 'keycloak');
        $this->reset($test, $user)->assertStatus(403)->assertJsonPath('error.code', 'forbidden');

        $this->actingAs(User::factory()->create(['role' => 'project_manager']), 'keycloak');

        // Nieznana osoba: 404.
        $this->postJson("/api/v1/admin/tests/{$test->id}/users/999999/reset-attempts", ['reason' => 'Powód resetu.'])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        // Brak powodu: walidacja stoi przed odmową zaliczonego testu.
        $this->reset($test, $user, [])->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');

        $this->assertSame(1, TestAttempt::where('user_id', $user->id)->count());
        $this->assertSame(0, AuditLogEntry::where('action', 'attempts.reset')->count());
    }
}
