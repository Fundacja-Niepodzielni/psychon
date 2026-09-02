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
 * H10 · kryterium ★2 — „test współbieżny `--filter=ConcurrentAttempt`, numery 1..N
 * bez dziur". Ten plik jest tą częścią kryterium, która NAPRAWDĘ jest współbieżna.
 *
 * Mierzy przypadek ZBIORU NIEPUSTEGO: pierwsze podejście istnieje, więc
 * `SELECT … FOR UPDATE` ma co zablokować.
 *
 * ⚠ WYNIK OBALIŁ HIPOTEZĘ, dla której ten plik powstał. Zakładałam, że przy
 * niepustym zbiorze blokada zadziała i różnica wobec `FirstAttemptRaceTest`
 * wskaże pusty zbiór jako jedyną przyczynę. **Zmierzone: 5 równoczesnych podejść
 * PO pierwszym → 1 zapisane, 4 razy `500:unikat-numeru`, w bazie numery [1, 2].**
 * Czyli luka NIE ogranicza się do pustego zbioru.
 *
 * Mechanizm: w PostgreSQL na poziomie `READ COMMITTED` `SELECT … FOR UPDATE`
 * blokuje wiersze ISTNIEJĄCE w chwili odczytu, ale nie broni przed **fantomami** —
 * transakcja, która czekała na zwolnienie blokady, po wznowieniu nadal nie widzi
 * wiersza WSTAWIONEGO przez poprzedniczkę. Obie liczą ten sam `max()+1`.
 * Blokada na zbiorze liczonym jest więc niewystarczająca ZAWSZE, a nie tylko
 * wtedy, gdy zbiór jest pusty — pusty zbiór jest po prostu najłatwiejszym
 * przypadkiem do trafienia.
 *
 * Wniosek dla naprawy: serializować na wierszu, który ISTNIEJE i jest WSPÓLNY
 * dla wszystkich piszących (edycja albo test), wzorem `H14/DocumentIssuer` —
 * i to jest jedyny wariant, który tu wystarczy.
 *
 * Celowo BEZ `RefreshDatabase` — procesy potomne nie zobaczą otwartej transakcji
 * rodzica jako zatwierdzonej. Dane zakładane i sprzątane ręcznie, do stanu
 * zastanego (P-6).
 *
 * `php artisan test --filter=ConcurrentAttempt`
 */
class ConcurrentAttemptNumberingTest extends TestCase
{
    use RequiresProcessConcurrency;

    /** Podejścia równoległe PO tym pierwszym, sekwencyjnym. */
    private const CONCURRENCY = 5;

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
                'name' => 'Edycja numeracji podejść',
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
            'title' => 'Kurs numeracji podejść',
            'slug' => 'kurs-numeracja-'.uniqid(),
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null,
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

    public function test_concurrent_attempts_after_the_first_are_numbered_without_gaps(): void
    {
        $answers = [];
        foreach ($this->test->questions()->with('answers')->get() as $question) {
            $answers[(string) $question->id] = $question->answers->firstWhere('is_correct', true)->id;
        }

        Sanctum::actingAs($this->user);

        // Pierwsze podejście SEKWENCYJNIE — po nim zbiór nie jest już pusty,
        // więc blokada wierszowa ma co blokować. To jest właśnie ta różnica,
        // której `FirstAttemptRaceTest` nie daje.
        $this->postJson("/api/v1/tests/{$this->test->id}/attempts", ['answers' => $answers])
            ->assertCreated();

        $directory = sys_get_temp_dir().'/h10-numeracja-'.uniqid('', true);
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

        $this->assertSame(
            range(1, self::CONCURRENCY + 1),
            $numbers,
            sprintf(
                'Numery podejść mają dziurę albo duplikat: [%s]. Odpowiedzi procesów: %s',
                implode(', ', $numbers),
                implode(', ', $results),
            ),
        );

        $this->assertSame(
            [],
            array_values(array_filter($results, static fn (string $r): bool => $r !== '201')),
            'Nie każde równoczesne podejście dostało 201: '.implode(', ', $results),
        );
    }
}
