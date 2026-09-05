<?php

namespace Tests\Feature\H10;

use App\Models\Course;
use App\Models\Edition;
use App\Models\Test;
use App\Models\TestAttempt;
use App\Models\User;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\Group;
use Tests\Concerns\RequiresProcessConcurrency;
use Tests\Concerns\RunsConcurrentRequests;
use Tests\TestCase;

/**
 * G-3 · perturbacja klasy „pusty zbiór pod `FOR UPDATE`" na drugim pakiecie.
 *
 * `H13` pokazał, że `SELECT … FOR UPDATE` na zbiorze PUSTYM nie blokuje niczego,
 * więc przy PIERWSZYM wydaniu w edycji równoległe transakcje liczą ten sam numer.
 * `TestController::store` (w. 88–95) ma dokładnie ten sam kształt:
 *
 *     $attemptNumber = 1 + TestAttempt::where(user)->where(test)->lockForUpdate()->pluck(…)->max();
 *
 * Przy PIERWSZYM podejściu tej pary (użytkownik, test) zbiór jest pusty — blokada
 * nie ma czego zablokować. (Pomiar późniejszy pokazał, że to NIE jest jedyny
 * przypadek: przy zbiorze niepustym wyścig kończy się tak samo, bo `FOR UPDATE`
 * nie broni przed fantomami — patrz `ConcurrentAttemptNumberingTest`. Pusty zbiór
 * jest najłatwiejszy do trafienia, nie jedyny.) Unikat `(user_id, test_id, attempt_number)` zamieni wyścig
 * w wyjątek, czyli w utracone podejście: uczestniczka klika „wyślij" dwa razy
 * (podwójne kliknięcie, wolna sieć, powrót „wstecz") i dostaje błąd zamiast wyniku.
 *
 * `H10\ConcurrentAttemptTest` tego NIE mierzy — zmierzone lekturą: pętla `for`
 * w JEDNYM procesie, osiem żądań po kolei. Nazwa mówi „Concurrent", kształt mówi
 * „sekwencyjnie". Docblock tamtego pliku obiecuje przy tym, że numer „jest liczony
 * w transakcji z `lockForUpdate`" — czyli dokumentacja o kodzie też jest tu przyrządem,
 * który nikt nie sprawdził.
 *
 * Celowo BEZ `RefreshDatabase` — procesy potomne nie zobaczą otwartej transakcji
 * rodzica jako zatwierdzonej. Dane zakładane i sprzątane ręcznie, do stanu ZASTANEGO
 * (reguła P-6, zapłacona własną wpadką).
 *
 * `php artisan test --filter=FirstAttemptRace`
 */
// Bez cechy bazodanowej runner rownolegly nie przelacza tej klasy na wlasna baze
// procesu (`TestDatabases.php:56`), wiec zostaje na bazie WSPOLNEJ i sciga sie z
// sasiadami. Grupa `wspolna-baza` wypada z kroku A bramki i biegnie sekwencyjnie w B.
// Regula pilnowana mechanicznie: `tests/Feature/Przyrzad/GrupaWspolnejBazyTest.php`.
#[Group('wspolna-baza')]
class FirstAttemptRaceTest extends TestCase
{
    use RequiresProcessConcurrency;
    use RunsConcurrentRequests;

    private const CONCURRENCY = 6;

    private Test $test;

    private User $user;

    private ?int $editionId = null;

    private bool $ownEdition = false;

    protected function setUp(): void
    {
        parent::setUp();
        $this->requireProcessConcurrency();

        $edition = Edition::query()->firstWhere('status', 'active');

        if ($edition === null) {
            $edition = Edition::create([
                'name' => 'Edycja wyścigu podejść',
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
            $this->ownEdition = true;
        }

        $this->editionId = $edition->id;

        $course = Course::create([
            'title' => 'Kurs wyścigu podejść',
            'slug' => 'kurs-wyscig-'.uniqid(),
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
        // Przywrócenie stanu zastanego zamiast ręcznej listy tabel — patrz
        // `TestCase::przywrocStanZastanejBazy()`. Strażnik w `TestCase::tearDown()`
        // sprawdza po nas, czy naprawdę nic nie zostało.
        $this->przywrocStanZastanejBazy();

        parent::tearDown();
    }

    public function test_simultaneous_first_attempts_do_not_lose_a_submission(): void
    {
        $this->assertSame(
            0,
            TestAttempt::where('test_id', $this->test->id)->count(),
            'Punkt wyjścia: żadnego podejścia. Inaczej świadek mierzy inny scenariusz — '
            .'blokada wierszowa MA co blokować i luka się nie ujawnia.',
        );

        $answers = [];
        foreach ($this->test->questions()->with('answers')->get() as $question) {
            $answers[(string) $question->id] = $question->answers->firstWhere('is_correct', true)->id;
        }

        // Uwierzytelnienie PRZED rozwidleniem — stan siedzi w pamięci procesu,
        // więc dzieci dziedziczą je razem z resztą aplikacji.
        Sanctum::actingAs($this->user);

        $results = $this->rownolegle(self::CONCURRENCY, function (int $i) use ($answers): string {
            return $this->sladOdpowiedzi(
                $this->postJson("/api/v1/tests/{$this->test->id}/attempts", ['answers' => $answers]),
            );
        });

        $numbers = TestAttempt::where('test_id', $this->test->id)
            ->orderBy('attempt_number')
            ->pluck('attempt_number')
            ->all();

        $udane = count(array_filter($results, static fn (string $r): bool => $r === '201'));

        $this->assertCount(
            self::CONCURRENCY,
            $numbers,
            sprintf(
                'Z %d równoczesnych pierwszych podejść zapisało się %d (odpowiedzi: %s). '
                .'Każde zgubione podejście to uczestniczka, która wysłała test i dostała błąd '
                .'zamiast wyniku. Numery w bazie: %s',
                self::CONCURRENCY,
                count($numbers),
                implode(', ', $results),
                implode(', ', $numbers) ?: '(brak)',
            ),
        );

        $this->assertSame(
            range(1, self::CONCURRENCY),
            $numbers,
            'Numery podejść mają dziurę albo duplikat: '.implode(', ', $numbers),
        );

        $this->assertSame(
            self::CONCURRENCY,
            $udane,
            'Nie każde żądanie dostało 201: '.implode(', ', $results),
        );
    }
}
