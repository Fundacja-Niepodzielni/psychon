<?php

namespace Tests\Feature\H10;

use App\Models\TestAttempt;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

/**
 * Pakiet H10 · kryterium 2 — numeracja podejść. Numer podejścia jest liczony
 * w transakcji z `lockForUpdate`, a unikat `(user_id, test_id, attempt_number)`
 * jest twardą barierą: przegrany wyścig dostaje błąd, nie zdublowany numer.
 *
 * `php artisan test --filter=ConcurrentAttempt`
 */
class ConcurrentAttemptTest extends TestPackageCase
{
    use RefreshDatabase;

    public function test_attempt_numbers_are_contiguous_from_one(): void
    {
        $test = $this->makeTest(testOverrides: ['attempts_limit' => 20], questions: 10);
        $user = $this->volunteer();
        Sanctum::actingAs($user);

        $numbers = [];

        for ($i = 0; $i < 8; $i++) {
            $numbers[] = $this->postJson("/api/v1/tests/{$test->id}/attempts", [
                'answers' => $this->answersFor($test, 5),
            ])->assertCreated()->json('data.attempt_number');
        }

        $this->assertSame(range(1, 8), $numbers, 'Numery podejść mają dziurę lub duplikat.');
        $this->assertSame(
            [1, 2, 3, 4, 5, 6, 7, 8],
            TestAttempt::where('test_id', $test->id)->orderBy('attempt_number')->pluck('attempt_number')->all(),
        );
    }

    public function test_unique_index_blocks_a_duplicated_attempt_number(): void
    {
        $test = $this->makeTest(questions: 3);
        $user = $this->volunteer();

        $payload = [
            'user_id' => $user->id,
            'test_id' => $test->id,
            'answers' => [],
            'questions_snapshot' => [],
            'score_percent' => 0,
            'passed' => false,
        ];

        TestAttempt::create([...$payload, 'attempt_number' => 1]);

        // Wyścig: drugi zapis policzył ten sam numer.
        $this->expectException(QueryException::class);
        TestAttempt::create([...$payload, 'attempt_number' => 1]);
    }
}
