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
 * Zaliczony test jest zamknięty: zaplecze odmawia nowego podejścia
 * (403 `test_already_passed`), a `GET /courses/{slug}/test` mówi, czy test
 * jest zaliczony (`passed`). Niezaliczony test działa jak dotąd.
 *
 * Reset podejść zaliczonego testu mierzy `PassedTestResetTest` obok.
 * Wyścig dwóch nowych podejść po zaliczeniu mierzy `PassedTestRaceTest` obok.
 */
class PassedTestClosedTest extends TestPackageCase
{
    use RefreshDatabase;

    private function attempt(Test $test, array $answers): TestResponse
    {
        return $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => $answers]);
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

    public function test_new_attempt_after_a_pass_is_refused_and_writes_nothing(): void
    {
        $test = $this->makeTest(questions: 10);
        $user = $this->volunteer();
        User::factory()->create(['role' => 'project_manager']);
        $this->actingAs($user, 'keycloak');

        $this->attempt($test, $this->answersFor($test, 10))->assertCreated()->assertJsonPath('data.passed', true);
        $before = $this->counts();

        $this->assertAlreadyPassed($this->attempt($test, $this->answersForAttempt($test, 2, 1)));
        $this->assertAlreadyPassed($this->attempt($test, $this->answersForAttempt($test, 9, 1)));

        $this->assertSame($before, $this->counts());
        $this->assertSame([1], TestAttempt::where('user_id', $user->id)->pluck('attempt_number')->all());
    }

    public function test_pass_on_the_last_attempt_hears_already_passed_not_attempts_exhausted(): void
    {
        $test = $this->makeTest(questions: 10);
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');

        $this->attempt($test, $this->answersForAttempt($test, 2, 1))->assertCreated()->assertJsonPath('data.passed', false);
        $this->attempt($test, $this->answersForAttempt($test, 2, 2))->assertCreated()->assertJsonPath('data.passed', false);
        $this->attempt($test, $this->answersFor($test, 10))->assertCreated()
            ->assertJsonPath('data.attempt_number', 3)
            ->assertJsonPath('data.passed', true);
        $before = $this->counts();

        $this->assertAlreadyPassed($this->attempt($test, $this->answersForAttempt($test, 2, 3)));
        $this->assertSame($before, $this->counts());
    }

    public function test_double_click_on_the_passing_attempt_returns_the_same_result(): void
    {
        $test = $this->makeTest(questions: 10);
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');
        $answers = $this->answersFor($test, 10);

        $first = $this->attempt($test, $answers)->assertCreated()->json('data');
        $second = $this->attempt($test, $answers)->assertCreated()->json('data');

        $this->assertSame($first, $second);
        $this->assertSame(1, $first['attempt_number']);
        $this->assertTrue($first['passed']);
        $this->assertSame(1, TestAttempt::where('user_id', $user->id)->count());
        $this->assertSame(1, AuditLogEntry::where('action', 'attempt.finished')->count());
    }

    public function test_failed_attempts_keep_the_previous_behaviour(): void
    {
        $test = $this->makeTest(questions: 10);
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');

        foreach ([1, 2, 3] as $n) {
            $this->attempt($test, $this->answersForAttempt($test, 2, $n))->assertCreated()
                ->assertJsonPath('data.attempt_number', $n)
                ->assertJsonPath('data.passed', false);
        }

        $this->attempt($test, $this->answersFor($test, 10))
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'attempts_exhausted');
        $this->assertSame(3, TestAttempt::where('user_id', $user->id)->count());
    }

    public function test_test_screen_reports_whether_the_test_is_passed(): void
    {
        $test = $this->makeTest(questions: 10);
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');
        $url = "/api/v1/courses/{$test->course->slug}/test";

        $this->getJson($url)->assertOk()->assertJsonPath('data.passed', false);

        $this->attempt($test, $this->answersForAttempt($test, 2, 1))->assertCreated();
        $this->getJson($url)->assertOk()->assertJsonPath('data.passed', false);

        $this->attempt($test, $this->answersFor($test, 10))->assertCreated();
        $this->getJson($url)->assertOk()
            ->assertJsonPath('data.passed', true)
            ->assertJsonPath('data.attempts_used', 2);
    }
}
