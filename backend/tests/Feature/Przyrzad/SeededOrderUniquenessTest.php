<?php

namespace Tests\Feature\Przyrzad;

use App\Models\Lesson;
use App\Models\TestQuestion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Kontrola krzyżowa PRZED migracjami zakładającymi unikat na `sequence_order`
 * (pozycje S1-15 i S1-16): czy w danych, które te migracje zastaną, są już
 * duplikaty. Jeśli są — migracja padnie przy zakładaniu indeksu i musi najpierw
 * przenumerować; jeśli nie ma — wystarczy sam indeks.
 *
 * ⚠ TEN PLIK POWSTAŁ Z WŁASNEJ WPADKI i to jest jego najważniejszy komentarz.
 * Obie te asercje siedziały pierwotnie w świadkach współbieżności, które
 * ŚWIADOMIE nie używają `RefreshDatabase` (bo procesy potomne nie zobaczyłyby
 * otwartej transakcji rodzica). Wywołanie `seed()` w takim teście zapisuje się
 * NA TRWAŁE — i zostawiło zaseedowaną bazę kolejnym testom. Skutek zmierzony:
 * **23 cudze testy na czerwono** (H08, H10, H15) w pełnym przebiegu, przy zielonym
 * przebiegu każdego z nich osobno.
 *
 * To jest DOKŁADNIE reguła `P-6`, którą sama zgłosiłam kilka godzin wcześniej po
 * identycznej wpadce — i którą tu złamałam po raz drugi, w pliku pisanym po jej
 * spisaniu. Wniosek nie brzmi „trzeba uważać", tylko: **test, który woła `seed()`,
 * musi mieć `RefreshDatabase`; jeśli go mieć nie może, nie wolno mu wołać `seed()`.**
 * Dlatego te dwie asercje mieszkają teraz osobno, w klasie, która transakcję ma.
 *
 * `php artisan test --filter=SeededOrderUniqueness`
 */
class SeededOrderUniquenessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_seeded_lessons_have_no_duplicate_positions(): void
    {
        $duplikaty = Lesson::query()
            ->selectRaw('course_id, sequence_order, count(*) as ile')
            ->groupBy('course_id', 'sequence_order')
            ->havingRaw('count(*) > 1')
            ->get();

        $this->assertCount(
            0,
            $duplikaty,
            'W danych seedowych są zdublowane pozycje lekcji — migracja z unikatem '
            .'`(course_id, sequence_order)` padnie, dopóki ich nie przenumerujesz.',
        );
    }

    public function test_seeded_questions_have_no_duplicate_positions(): void
    {
        $duplikaty = TestQuestion::query()
            ->selectRaw('test_id, sequence_order, count(*) as ile')
            ->groupBy('test_id', 'sequence_order')
            ->havingRaw('count(*) > 1')
            ->get();

        $this->assertCount(
            0,
            $duplikaty,
            'W danych seedowych są zdublowane pozycje pytań — migracja z unikatem '
            .'`(test_id, sequence_order)` padnie.',
        );
    }

    public function test_the_check_has_something_to_check(): void
    {
        // Zero duplikatów przy zerze wierszy nie jest pomiarem, tylko pustym zapytaniem.
        // Bez tej asercji obie kontrole wyżej byłyby zielone także na pustej bazie —
        // czyli dokładnie wtedy, gdy nie mierzą nic.
        $this->assertGreaterThan(0, Lesson::count(), 'Brak lekcji — kontrola nie ma czego mierzyć.');
        $this->assertGreaterThan(0, TestQuestion::count(), 'Brak pytań — kontrola nie ma czego mierzyć.');
    }
}
