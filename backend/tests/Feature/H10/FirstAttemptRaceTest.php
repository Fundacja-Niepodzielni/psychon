<?php

namespace Tests\Feature\H10;

use App\Models\Course;
use App\Models\Edition;
use App\Models\Test;
use App\Models\TestAttempt;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\RequiresProcessConcurrency;
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
 * nie ma czego zablokować. Unikat `(user_id, test_id, attempt_number)` zamieni wyścig
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
class FirstAttemptRaceTest extends TestCase
{
    use RequiresProcessConcurrency;

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
        if (isset($this->test)) {
            TestAttempt::where('test_id', $this->test->id)->delete();
            $courseId = $this->test->course_id;
            $this->test->questions()->each(function ($question): void {
                $question->answers()->delete();
                $question->delete();
            });
            Test::whereKey($this->test->id)->delete();
            Course::whereKey($courseId)->forceDelete();
        }

        if (isset($this->user)) {
            User::whereKey($this->user->id)->forceDelete();
        }

        if ($this->ownEdition && $this->editionId !== null) {
            Edition::whereKey($this->editionId)->delete();
        }

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

        $directory = sys_get_temp_dir().'/h10-wyscig-'.uniqid('', true);
        mkdir($directory);
        $go = $directory.'/go';
        $children = [];

        for ($i = 0; $i < self::CONCURRENCY; $i++) {
            $pid = pcntl_fork();

            if ($pid === -1) {
                $this->fail('Nie udało się uruchomić procesu testu współbieżności.');
            }

            if ($pid === 0) {
                DB::purge();
                file_put_contents($directory.'/ready-'.$i, 'ready');

                while (! file_exists($go)) {
                    usleep(1000);
                }

                try {
                    $odpowiedz = $this->postJson(
                        "/api/v1/tests/{$this->test->id}/attempts",
                        ['answers' => $answers],
                    );

                    // Sam kod statusu nie mówi, CO poszło nie tak. Przy 500 zapisujemy
                    // ślad przyczyny, żeby raport odróżnił wyścig o numer od awarii
                    // przyrządu — bez tego „500" jest zagadką, a nie pomiarem.
                    $slad = (string) $odpowiedz->status();

                    if ($odpowiedz->status() >= 500) {
                        $tresc = (string) $odpowiedz->getContent();
                        $slad .= str_contains($tresc, '23505') || str_contains($tresc, 'attempt_number')
                            ? ':unikat-numeru'
                            : ':inna-przyczyna';
                    }

                    file_put_contents($directory.'/result-'.$i, $slad);
                } catch (\Throwable $exception) {
                    file_put_contents(
                        $directory.'/result-'.$i,
                        str_contains($exception->getMessage(), '23505') ? 'wyjatek:unikat-numeru' : 'wyjatek:inna',
                    );
                }

                exit(0);
            }

            $children[] = $pid;
        }

        for ($attempt = 0; $attempt < 20000; $attempt++) {
            if (count(glob($directory.'/ready-*')) === self::CONCURRENCY) {
                break;
            }
            usleep(1000);
        }

        $this->assertCount(
            self::CONCURRENCY,
            glob($directory.'/ready-*'),
            'Nie wszystkie procesy doszły do bariery — pomiar nie był współbieżny.',
        );

        file_put_contents($go, 'go');

        foreach ($children as $pid) {
            pcntl_waitpid($pid, $status);
        }

        $results = array_map(
            static fn (string $path): string => trim((string) file_get_contents($path)),
            glob($directory.'/result-*'),
        );

        foreach (glob($directory.'/*') as $file) {
            @unlink($file);
        }
        @rmdir($directory);

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
