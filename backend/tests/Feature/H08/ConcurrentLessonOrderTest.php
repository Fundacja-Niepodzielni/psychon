<?php

namespace Tests\Feature\H08;

use App\Models\Course;
use App\Models\Edition;
use App\Models\Lesson;
use App\Models\User;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\Group;
use Tests\Concerns\RequiresProcessConcurrency;
use Tests\Concerns\RunsConcurrentRequests;
use Tests\TestCase;

/**
 * Świadek kolejności lekcji w kursie.
 *
 * `LessonWriter::nextSequenceOrder` (w. 94) liczy `max('sequence_order') + 1`
 * **bez żadnej blokady**, a `lessons.sequence_order` **nie ma unikatu**
 * (migracja `…000040…` w. 34). To ta sama klasa problemu co przy podejściach
 * i certyfikatach, ale z gorszym objawem: tam unikalny indeks zamienia wyścig w wyjątek —
 * głośny i policzalny. Tutaj wyścig kończy się **dwiema lekcjami na tej samej
 * pozycji i niczyim błędem**. Cicha niespójność zamiast czerwieni.
 *
 * Dlaczego to nie jest teoria: ekran H08 istnieje i był odebrany 31.08, a dwie
 * osoby dodające lekcje do jednego kursu w tej samej chwili to zwykła praca
 * redakcyjna, nie egzotyka.
 *
 * Pomiar duplikatów w danych seedowych (kontrola krzyżowa przed migracją z unikatem):
 * `lessons` grupowane po `(course_id, sequence_order)` → **0 wierszy z `count(*) > 1`**
 * przy 30 lekcjach w 11 kursach. Migracja zakładająca unikat nie potrzebuje więc
 * kroku renumerującego.
 *
 * ⚠ Czerwony do czasu dołożenia blokady/unikatu przy numerowaniu kolejności
 * lekcji. Nie naprawiam tutaj — ten plik tylko mierzy.
 *
 * `php artisan test --filter=ConcurrentLessonOrder`
 */
// Bez cechy bazodanowej runner rownolegly nie przelacza tej klasy na wlasna baze
// procesu (`TestDatabases.php:56`), wiec zostaje na bazie WSPOLNEJ i sciga sie z
// sasiadami. Grupa `wspolna-baza` wypada z kroku A bramki i biegnie sekwencyjnie w B.
// Regula pilnowana mechanicznie: `tests/Feature/Przyrzad/GrupaWspolnejBazyTest.php`.
#[Group('wspolna-baza')]
class ConcurrentLessonOrderTest extends TestCase
{
    use RequiresProcessConcurrency;
    use RunsConcurrentRequests;

    private const CONCURRENCY = 6;

    private Course $course;

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
                'name' => 'Edycja kolejności lekcji',
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

        $this->course = Course::create([
            'title' => 'Kurs kolejności lekcji',
            'slug' => 'kurs-kolejnosc-'.uniqid(),
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null,
            'edition_id' => $edition->id,
            'is_published' => false,
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

    public function test_simultaneous_lesson_additions_get_distinct_positions(): void
    {
        $this->assertSame(
            0,
            Lesson::where('course_id', $this->course->id)->count(),
            'Punkt wyjścia: kurs bez lekcji.',
        );

        Sanctum::actingAs($this->admin);

        $wyniki = $this->rownolegle(self::CONCURRENCY, function (int $i): string {
            return $this->sladOdpowiedzi(
                $this->postJson("/api/v1/admin/courses/{$this->course->id}/lessons", [
                    'title' => "Lekcja równoległa {$i}",
                    'duration_seconds' => 600,
                ]),
            );
        });

        $pozycje = Lesson::where('course_id', $this->course->id)
            ->orderBy('sequence_order')
            ->pluck('sequence_order')
            ->all();

        $this->assertCount(
            self::CONCURRENCY,
            $pozycje,
            'Powstało '.count($pozycje).' lekcji zamiast '.self::CONCURRENCY.'. Odpowiedzi: '.implode(', ', $wyniki),
        );

        // SEDNO: bez unikatu nie ma wyjątku, więc jedynym śladem wyścigu są
        // POWTÓRZONE pozycje. Test liczący tylko liczbę lekcji byłby zielony.
        $this->assertSame(
            count($pozycje),
            count(array_unique($pozycje)),
            'Dwie lekcje stoją na tej samej pozycji w kursie: ['.implode(', ', $pozycje).']. '
            .'Nikt nie dostał błędu — kolejność lekcji jest odtąd nieokreślona. Odpowiedzi: '
            .implode(', ', $wyniki),
        );

        $this->assertSame(
            range(1, self::CONCURRENCY),
            $pozycje,
            'Pozycje lekcji nie tworzą ciągu 1..'.self::CONCURRENCY.': ['.implode(', ', $pozycje).']',
        );
    }
}
