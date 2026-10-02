<?php

namespace Tests\Feature\H10;

use App\Models\Course;
use App\Models\Edition;
use App\Models\Test;
use App\Models\TestAttempt;
use App\Models\User;
use PHPUnit\Framework\Attributes\Group;
use Tests\Concerns\RequiresProcessConcurrency;
use Tests\Concerns\RunsConcurrentRequests;
use Tests\TestCase;

/**
 * Dwa nowe podejścia wysłane w tej samej chwili PO zaliczeniu: oba dostają
 * 403 `test_already_passed`, w bazie zostaje wyłącznie podejście zaliczające.
 *
 * Odmowa stoi pod blokadą wiersza użytkownika, tą samą co limit, więc żadne
 * z równoległych żądań nie mija sprawdzenia zaliczenia.
 *
 * Celowo BEZ `RefreshDatabase` — procesy potomne nie widzą otwartej transakcji
 * rodzica. Dane sprzątane do stanu zastanego (`przywrocStanZastanejBazy`).
 */
#[Group('wspolna-baza')]
class PassedTestRaceTest extends TestCase
{
    use RequiresProcessConcurrency;
    use RunsConcurrentRequests;

    private const CONCURRENCY = 2;

    private Test $test;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->requireProcessConcurrency();

        $edition = Edition::query()->firstWhere('status', 'active') ?? Edition::create([
            'name' => 'Edycja wyścigu po zaliczeniu',
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

        $course = Course::create([
            'title' => 'Kurs wyścigu po zaliczeniu',
            'slug' => 'kurs-wyscig-zaliczony-'.uniqid(),
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null, // poza sekwencją → CourseAccess nie blokuje
            'edition_id' => $edition->id,
            'is_published' => true,
        ]);

        $test = $course->test()->create([
            'pass_threshold' => null,
            'attempts_limit' => 20, // limit nie może być tym, co zatrzyma wyścig
            'question_count' => 3,
        ]);

        foreach (range(1, 3) as $n) {
            $question = $test->questions()->create(['body' => "Pytanie {$n}?", 'sequence_order' => $n]);

            foreach (range(1, 4) as $a) {
                $question->answers()->create([
                    'body' => "Odpowiedź {$a} do pytania {$n}",
                    'is_correct' => $a === 1,
                ]);
            }
        }

        $this->test = $test->fresh(['questions.answers', 'course']);
        $this->user = User::factory()->create(['role' => 'volunteer', 'edition_id' => $edition->id]);
    }

    protected function tearDown(): void
    {
        $this->przywrocStanZastanejBazy();

        parent::tearDown();
    }

    public function test_two_simultaneous_new_attempts_after_a_pass_are_both_refused(): void
    {
        $this->actingAs($this->user, 'keycloak');

        // Zestaw nr 1 to same poprawne odpowiedzi: podejście zaliczające.
        $this->postJson("/api/v1/tests/{$this->test->id}/attempts", ['answers' => $this->zestawOdpowiedzi(1)])
            ->assertCreated()
            ->assertJsonPath('data.passed', true);

        // Zestawy liczone PRZED rozwidleniem i różne od zaliczającego — inaczej serwer
        // rozpoznałby powtórzenie i odpowiedział 201 wynikiem tamtego podejścia.
        $zestawy = [];
        foreach (range(0, self::CONCURRENCY - 1) as $i) {
            $zestawy[$i] = $this->zestawOdpowiedzi($i + 2);
        }

        $results = $this->rownolegle(self::CONCURRENCY, function (int $i) use ($zestawy): string {
            $odpowiedz = $this->postJson("/api/v1/tests/{$this->test->id}/attempts", ['answers' => $zestawy[$i]]);

            return $this->sladOdpowiedzi($odpowiedz).':'.(string) $odpowiedz->json('error.code');
        });

        $this->assertSame(
            array_fill(0, self::CONCURRENCY, '403:test_already_passed'),
            $results,
            'Nie każde równoległe podejście po zaliczeniu dostało odmowę: '.implode(', ', $results),
        );

        $this->assertSame(
            [[1, true]],
            TestAttempt::where('test_id', $this->test->id)
                ->orderBy('attempt_number')
                ->get()
                ->map(fn (TestAttempt $a): array => [$a->attempt_number, $a->passed])
                ->all(),
        );
    }

    /**
     * Zestaw odpowiedzi nr $nr — RÓŻNY dla każdego numeru; nr 1 = same poprawne
     * (pierwsza odpowiedź każdego pytania jest poprawna).
     *
     * @return array<string, int>
     */
    private function zestawOdpowiedzi(int $nr): array
    {
        $reszta = $nr - 1;
        $answers = [];

        foreach ($this->test->questions()->with('answers')->get() as $question) {
            $opcje = $question->answers->sortBy('id')->values();
            $answers[(string) $question->id] = $opcje[$reszta % $opcje->count()]->id;
            $reszta = intdiv($reszta, $opcje->count());
        }

        return $answers;
    }
}
