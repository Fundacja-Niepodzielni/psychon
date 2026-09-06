<?php

namespace Tests\Feature\H10;

use App\Models\Course;
use App\Models\Edition;
use App\Models\Test;
use App\Models\User;
use Tests\TestCase;

/**
 * Wspólne fixture'y pakietu H10 — minimalna edycja, kurs z testem i bank pytań.
 */
abstract class TestPackageCase extends TestCase
{
    protected function activeEdition(array $overrides = []): Edition
    {
        return Edition::query()->firstWhere('status', 'active') ?? Edition::create([
            'name' => 'Edycja testowa',
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
            ...$overrides,
        ]);
    }

    /**
     * Kurs poza sekwencją (zawsze odblokowany) z testem: $questions pytań,
     * po $answersPer odpowiedzi, pierwsza odpowiedź każdego pytania poprawna.
     */
    protected function makeTest(array $testOverrides = [], int $questions = 10, int $answersPer = 4): Test
    {
        $edition = $this->activeEdition();

        $course = Course::create([
            'title' => 'Kurs testowy '.uniqid(),
            'slug' => 'kurs-testowy-'.uniqid(),
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null, // poza sekwencją → CourseAccess nie blokuje
            'edition_id' => $edition->id,
            'is_published' => true,
        ]);

        $test = $course->test()->create([
            'pass_threshold' => null,
            'attempts_limit' => null,
            'question_count' => $questions,
            ...$testOverrides,
        ]);

        foreach (range(1, $questions) as $n) {
            $question = $test->questions()->create([
                'body' => "Pytanie {$n}?",
                'sequence_order' => $n,
            ]);

            foreach (range(1, $answersPer) as $a) {
                $question->answers()->create([
                    'body' => "Odpowiedź {$a} do pytania {$n}",
                    'is_correct' => $a === 1,
                ]);
            }
        }

        return $test->fresh(['questions.answers', 'course']);
    }

    /**
     * Zestaw odpowiedzi dla podejścia: pierwsze $correctCount pytań poprawnie,
     * reszta błędnie.
     *
     * @return array<string, int>
     */
    protected function answersFor(Test $test, int $correctCount): array
    {
        $answers = [];

        foreach ($test->questions()->with('answers')->get()->values() as $index => $question) {
            $correct = $question->answers->firstWhere('is_correct', true);
            $wrong = $question->answers->firstWhere('is_correct', false);
            $answers[(string) $question->id] = ($index < $correctCount ? $correct : $wrong)->id;
        }

        return $answers;
    }

    /**
     * Zestaw odpowiedzi dla KOLEJNEGO podejścia: ten sam wynik punktowy co
     * `answersFor($test, $correctCount)`, ale inna treść zgłoszenia.
     *
     * Dwie wysyłki z identycznym zestawem odpowiedzi to dla serwera JEDNO
     * zgłoszenie (powtórzenie, np. podwójne kliknięcie „wyślij test"), więc
     * fixture, który chce N osobnych podejść, musi wysłać N różnych zestawów.
     * Różnicujemy WYŁĄCZNIE to, KTÓRA błędna odpowiedź pada w pytaniach na minus:
     * każda z nich daje zero punktów, więc `score_percent` i `passed` są dokładnie
     * takie jak przy `answersFor` — zmienia się treść, nie wynik.
     *
     * `$attempt` numerujemy od 1. Wariant jest zapisem pozycyjnym numeru podejścia
     * na pytaniach odpowiedzianych błędnie — przy `w` takich pytaniach i `k`
     * błędnych odpowiedziach w każdym mamy `k^w` różnych zestawów o tym samym
     * wyniku. Gdy zestawów nie starcza, metoda mówi to wprost zamiast po cichu
     * oddać powtórzenie: cichy duplikat jest właśnie tym, co ten fixture ma mierzyć.
     *
     * @return array<string, int>
     */
    protected function answersForAttempt(Test $test, int $correctCount, int $attempt): array
    {
        $questions = $test->questions()->with('answers')->get()->values();
        $wariant = $attempt - 1;
        $answers = [];
        $wariantow = 1;
        $reszta = $wariant;

        foreach ($questions as $index => $question) {
            if ($index < $correctCount) {
                $answers[(string) $question->id] = $question->answers->firstWhere('is_correct', true)->id;

                continue;
            }

            $wrong = $question->answers->where('is_correct', false)->sortBy('id')->values();
            $answers[(string) $question->id] = $wrong[$reszta % $wrong->count()]->id;
            $reszta = intdiv($reszta, $wrong->count());
            $wariantow *= $wrong->count();
        }

        if ($wariant >= $wariantow) {
            throw new \LogicException(sprintf(
                'Zestawów o tym samym wyniku jest tu %d, a fixture prosi o %d. Bez tylu RÓŻNYCH '
                .'zestawów kolejne wysyłki byłyby dla serwera jednym zgłoszeniem. Daj więcej pytań '
                .'odpowiadanych błędnie albo różnicuj podejścia wynikiem.',
                $wariantow,
                $attempt,
            ));
        }

        return $answers;
    }

    protected function volunteer(): User
    {
        return User::factory()->create(['role' => 'volunteer']);
    }
}
