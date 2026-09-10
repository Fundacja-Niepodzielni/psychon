<?php

namespace Tests\Feature\H10;

use App\Models\TestAttempt;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

/**
 * Pakiet H10 · kryterium ★2 — „test współbieżny `--filter=ConcurrentAttempt`,
 * numery 1..N bez dziur" (karta H10).
 *
 * ⚠ TEN PLIK BYŁ SEKWENCYJNY MIMO NAZWY. Do 02.09.2026 pierwszy test robił pętlę
 * `for` z ośmioma żądaniami po kolei, w JEDNYM procesie — czyli nie było dwóch
 * transakcji, które mogłyby się ścigać. Docblock obiecywał przy tym „transakcję
 * z `lockForUpdate`", więc dokumentacja o kodzie też była tu przyrządem, którego
 * nikt nie sprawdził. Karta wskazuje ten filtr jako dowód współbieżności, więc
 * filtr musi ją naprawdę mierzyć.
 *
 * Teraz plik mierzy przypadek ZBIORU NIEPUSTEGO: pierwsze podejście istnieje,
 * więc `SELECT … FOR UPDATE` ma co zablokować i serializacja ma prawo zadziałać.
 * Przypadek zbioru PUSTEGO (pierwsze podejście w wyścigu) ma własnego świadka —
 * `H10\FirstAttemptRaceTest` — bo tam blokada wierszowa nie ma czego zablokować
 * i to jest osobna luka.
 *
 * Celowo BEZ `RefreshDatabase` w teście równoległym: procesy potomne nie zobaczą
 * otwartej transakcji rodzica jako zatwierdzonej.
 *
 * `php artisan test --filter=ConcurrentAttempt`
 */
class ConcurrentAttemptTest extends TestPackageCase
{
    use RefreshDatabase;

    public function test_sequential_attempt_numbers_are_contiguous_from_one(): void
    {
        // Nazwa mówi teraz wprost, że to pomiar SEKWENCYJNY — osiem żądań po kolei
        // w jednym procesie. Jest wart utrzymania (sprawdza numerację i limit),
        // ale nie jest dowodem współbieżności i nie może za taki uchodzić.
        // Dowód współbieżności: `ConcurrentAttemptNumberingTest` obok.

        $test = $this->makeTest(testOverrides: ['attempts_limit' => 20], questions: 10);
        $user = $this->volunteer();
        Sanctum::actingAs($user);

        $numbers = [];

        // Osiem OSOBNYCH podejść, więc osiem różnych zestawów odpowiedzi o tym samym
        // wyniku 50%. Osiem razy ta sama treść byłaby dla serwera jednym zgłoszeniem
        // i numeracja nie miałaby czego numerować.
        for ($i = 0; $i < 8; $i++) {
            $numbers[] = $this->postJson("/api/v1/tests/{$test->id}/attempts", [
                'answers' => $this->answersForAttempt($test, 5, $i + 1),
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
