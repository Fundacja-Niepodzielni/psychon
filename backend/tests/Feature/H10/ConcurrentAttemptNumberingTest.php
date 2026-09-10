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
 * zastanego, jak każdy test bez `RefreshDatabase` — inaczej zostawia ślad, na który
 * wpadną sąsiednie testy w kolejnym przebiegu.
 *
 * `php artisan test --filter=ConcurrentAttempt`
 */
// Bez cechy bazodanowej runner rownolegly nie przelacza tej klasy na wlasna baze
// procesu (`TestDatabases.php:56`), wiec zostaje na bazie WSPOLNEJ i sciga sie z
// sasiadami. Grupa `wspolna-baza` wypada z kroku A bramki i biegnie sekwencyjnie w B.
// Regula pilnowana mechanicznie: `tests/Feature/Przyrzad/GrupaWspolnejBazyTest.php`.
#[Group('wspolna-baza')]
class ConcurrentAttemptNumberingTest extends TestCase
{
    use RequiresProcessConcurrency;
    use RunsConcurrentRequests;

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
        // Sześć ODRĘBNYCH podejść (jedno sekwencyjne + pięć równoczesnych), więc sześć
        // różnych zestawów odpowiedzi. Dwa zgłoszenia o identycznej treści są dla serwera
        // jednym zgłoszeniem (powtórzenie „wyślij test"), a tu nie o powtórzenie chodzi.
        // Różnicujemy treść — wspólna zostaje CHWILA wysyłki, czyli sam wyścig.
        // Zestawy liczone PRZED rozwidleniem: dziecko ma dostać gotowe dane, nie zapytanie.
        $zestawy = [];
        foreach (range(0, self::CONCURRENCY) as $i) {
            $zestawy[$i] = $this->zestawOdpowiedzi($i + 1);
        }

        Sanctum::actingAs($this->user);

        // Pierwsze podejście SEKWENCYJNIE — po nim zbiór nie jest już pusty,
        // więc blokada wierszowa ma co blokować. To jest właśnie ta różnica,
        // której `FirstAttemptRaceTest` nie daje.
        $this->postJson("/api/v1/tests/{$this->test->id}/attempts", ['answers' => $zestawy[0]])
            ->assertCreated();

        $results = $this->rownolegle(self::CONCURRENCY, function (int $i) use ($zestawy): string {
            return $this->sladOdpowiedzi(
                $this->postJson("/api/v1/tests/{$this->test->id}/attempts", ['answers' => $zestawy[$i + 1]]),
            );
        });

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

    /**
     * Zestaw odpowiedzi podejścia nr $nr — RÓŻNY dla każdego numeru.
     *
     * Numer zapisujemy pozycyjnie na pytaniach (każde ma cztery odpowiedzi), więc
     * przy trzech pytaniach mamy 64 różne zestawy. Wynik punktowy nie ma tu znaczenia:
     * ten świadek pyta wyłącznie o numerację 1..N bez dziur i duplikatów.
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
