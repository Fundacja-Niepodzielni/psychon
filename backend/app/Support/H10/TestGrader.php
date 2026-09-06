<?php

namespace App\Support\H10;

use App\Models\Test;
use App\Support\Settings;

/**
 * Pakiet H10 · ocenianie testów wiedzy — wyłącznie po stronie serwera.
 *
 * Progi czyta z aktywnej edycji (`Settings::edition`); kolumny `tests.pass_threshold`
 * / `tests.attempts_limit` to nadpisania per kurs (null = wartość edycji).
 * Nie jest to fasada startera — logika należy do pakietu H10.
 */
final class TestGrader
{
    /** Próg zaliczenia w procentach dla danego testu. */
    public static function passThreshold(Test $test): int
    {
        return (int) ($test->pass_threshold ?? Settings::edition('test_pass_threshold'));
    }

    /** Maksymalna liczba podejść do danego testu. */
    public static function attemptsLimit(Test $test): int
    {
        return (int) ($test->attempts_limit ?? Settings::edition('test_attempts_limit'));
    }

    /**
     * Zamrożony obraz treści pytań i odpowiedzi (z flagą poprawności) —
     * zapisywany razem z podejściem, żeby późniejsza edycja banku pytań
     * nie zmieniła historii (kryteria 3 i 6).
     *
     * @return list<array{id:int, body:string, answers:list<array{id:int, body:string, is_correct:bool}>}>
     */
    public static function snapshot(Test $test): array
    {
        return $test->questions()->with('answers')->get()
            ->map(fn ($question): array => [
                'id' => $question->id,
                'body' => $question->body,
                'answers' => $question->answers
                    ->map(fn ($answer): array => [
                        'id' => $answer->id,
                        'body' => $answer->body,
                        'is_correct' => (bool) $answer->is_correct,
                    ])
                    ->values()
                    ->all(),
            ])
            ->values()
            ->all();
    }

    /**
     * Ocena podejścia względem zamrożonego obrazu pytań.
     *
     * @param  list<array{id:int, answers:list<array{id:int, is_correct:bool}>}>  $snapshot
     * @param  array<int|string, int|string|null>  $answers  question_id => answer_id
     * @return array{score_percent:int, wrong_question_ids:list<int>}
     */
    public static function grade(array $snapshot, array $answers): array
    {
        $total = count($snapshot);
        $correct = 0;
        $wrong = [];

        foreach ($snapshot as $question) {
            $picked = $answers[(string) $question['id']] ?? $answers[$question['id']] ?? null;

            $correctAnswerId = null;
            foreach ($question['answers'] as $answer) {
                if ($answer['is_correct']) {
                    $correctAnswerId = $answer['id'];
                    break;
                }
            }

            if ($picked !== null && (int) $picked === (int) $correctAnswerId) {
                $correct++;
            } else {
                $wrong[] = (int) $question['id'];
            }
        }

        $score = $total > 0 ? (int) round($correct / $total * 100) : 0;

        return ['score_percent' => $score, 'wrong_question_ids' => $wrong];
    }
}
