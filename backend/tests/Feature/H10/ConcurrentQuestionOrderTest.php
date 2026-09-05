<?php

namespace Tests\Feature\H10;

use App\Models\Course;
use App\Models\Edition;
use App\Models\Test;
use App\Models\TestQuestion;
use App\Models\User;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\Group;
use Tests\Concerns\RequiresProcessConcurrency;
use Tests\Concerns\RunsConcurrentRequests;
use Tests\TestCase;

/**
 * S1-16 · świadek kolejności pytań w banku testu.
 *
 * `AdminTestQuestionController::store` (w. 39) liczy `max('sequence_order') + 1`
 * w transakcji **bez `lockForUpdate` w ogóle**, a `test_questions.sequence_order`
 * **nie ma unikatu** (migracja `…000050…` w. 28). Skutek wyścigu: dwa pytania
 * na tej samej pozycji, **bez wyjątku i bez czerwieni** — kolejność pytań w teście
 * staje się nieokreślona.
 *
 * Historia podejść jest bezpieczna (`questions_snapshot` zamraża treść), więc to
 * nie jest utrata danych, tylko utrata porządku. Ryzyko dziś jest NIŻSZE niż przy
 * lekcjach, bo panel edycji pytań to pozycja S1-8 sesji FRONT i jeszcze nie
 * istnieje — trasę wywołuje się tylko z API. Rośnie dokładnie w dniu, w którym
 * ekran powstanie.
 *
 * Pomiar duplikatów w danych seedowych: `test_questions` po `(test_id, sequence_order)`
 * → **0 wierszy z `count(*) > 1`** przy 30 pytaniach w 3 testach. Migracja
 * z unikatem nie potrzebuje kroku renumerującego.
 *
 * ⚠ Czerwony do czasu pozycji S1-16 (zakres KOD-DOPIECIA). Nie naprawiam.
 *
 * `php artisan test --filter=ConcurrentQuestionOrder`
 */
// Bez cechy bazodanowej runner rownolegly nie przelacza tej klasy na wlasna baze
// procesu (`TestDatabases.php:56`), wiec zostaje na bazie WSPOLNEJ i sciga sie z
// sasiadami. Grupa `wspolna-baza` wypada z kroku A bramki i biegnie sekwencyjnie w B.
// Regula pilnowana mechanicznie: `tests/Feature/Przyrzad/GrupaWspolnejBazyTest.php`.
#[Group('wspolna-baza')]
class ConcurrentQuestionOrderTest extends TestCase
{
    use RequiresProcessConcurrency;
    use RunsConcurrentRequests;

    private const CONCURRENCY = 6;

    private Test $test;

    private User $admin;

    private ?int $editionId = null;

    private bool $ownEdition = false;

    protected function setUp(): void
    {
        parent::setUp();
        $this->requireProcessConcurrency();

        $edition = Edition::query()->firstWhere('status', 'active');

        if ($edition === null) {
            $edition = Edition::create([
                'name' => 'Edycja kolejności pytań',
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
            'title' => 'Kurs kolejności pytań',
            'slug' => 'kurs-pytania-'.uniqid(),
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null,
            'edition_id' => $edition->id,
            'is_published' => true,
        ]);

        $this->test = $course->test()->create([
            'pass_threshold' => null,
            'attempts_limit' => null,
            'question_count' => 10,
        ]);

        $this->admin = User::factory()->create(['role' => 'super_admin', 'edition_id' => $edition->id]);
    }

    protected function tearDown(): void
    {
        // Przywrócenie stanu zastanego zamiast ręcznej listy tabel — patrz
        // `TestCase::przywrocStanZastanejBazy()`. Strażnik w `TestCase::tearDown()`
        // sprawdza po nas, czy naprawdę nic nie zostało.
        $this->przywrocStanZastanejBazy();

        parent::tearDown();
    }

    public function test_simultaneous_question_additions_get_distinct_positions(): void
    {
        $this->assertSame(0, $this->test->questions()->count(), 'Punkt wyjścia: bank bez pytań.');

        Sanctum::actingAs($this->admin);

        $wyniki = $this->rownolegle(self::CONCURRENCY, function (int $i): string {
            return $this->sladOdpowiedzi(
                $this->postJson("/api/v1/admin/tests/{$this->test->id}/questions", [
                    'body' => "Pytanie równoległe {$i}?",
                    'answers' => [
                        ['body' => 'Poprawna', 'is_correct' => true],
                        ['body' => 'Błędna', 'is_correct' => false],
                    ],
                ]),
            );
        });

        $pozycje = TestQuestion::where('test_id', $this->test->id)
            ->orderBy('sequence_order')
            ->pluck('sequence_order')
            ->all();

        $this->assertCount(
            self::CONCURRENCY,
            $pozycje,
            'Powstało '.count($pozycje).' pytań zamiast '.self::CONCURRENCY.'. Odpowiedzi: '.implode(', ', $wyniki),
        );

        // SEDNO: bez unikatu wyścig nie rzuca wyjątku. Jedynym śladem są
        // POWTÓRZONE pozycje — i tylko one odróżniają wynik poprawny od zepsutego.
        $this->assertSame(
            count($pozycje),
            count(array_unique($pozycje)),
            'Dwa pytania stoją na tej samej pozycji: ['.implode(', ', $pozycje).']. '
            .'Nikt nie dostał błędu. Odpowiedzi: '.implode(', ', $wyniki),
        );

        $this->assertSame(
            range(1, self::CONCURRENCY),
            $pozycje,
            'Pozycje pytań nie tworzą ciągu 1..'.self::CONCURRENCY.': ['.implode(', ', $pozycje).']',
        );
    }
}
