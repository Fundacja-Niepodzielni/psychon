<?php

namespace Tests\Unit\Przyrzad;

use PHPUnit\Framework\TestCase;
use Tests\Concerns\StanZastanejBazyOpis;

/**
 * Świadek NAZWY kierunku rozjazdu (kryterium karty: przyrost i ubytek liczności
 * tabel muszą brzmieć w nagłówku różnie, bo znaczą różne przyczyny — dopisane
 * dane kontra wyczyszczona baza, `F-49`).
 *
 * Trzy przypadki, jeden ujemna kontrola:
 *   1. same przyrosty → nagłówek nazywa to „dopisaniem" / „śladem",
 *   2. same ubytki → nagłówek WYRAŹNIE zaprzecza „śladowi" i nazywa to ubytkiem,
 *   3. oba naraz → nagłówek nazywa to „mieszanym", nie żadnym z dwóch powyżej.
 * Bez testu 3 wystarczyłoby, żeby nagłówek pytał tylko „czy jest jakikolwiek
 * przyrost" — i zlałby przypadek mieszany z czystym przyrostem.
 *
 * `php artisan test --filter=StanZastanejBazyOpis`
 */
final class StanZastanejBazyOpisTest extends TestCase
{
    public function test_only_growth_is_named_as_leaving_a_trace(): void
    {
        $naglowek = StanZastanejBazyOpis::naglowek(
            przed: ['users' => 0, 'lesson_progress' => 0],
            po: ['users' => 3, 'lesson_progress' => 0],
        );

        $this->assertStringContainsString('DOPISAŁ', $naglowek);
        $this->assertStringNotContainsString('WYCZYŚCIŁ', $naglowek);
        $this->assertStringNotContainsString('MIESZANY', $naglowek);
    }

    public function test_only_shrinkage_is_named_as_something_other_than_a_trace(): void
    {
        $naglowek = StanZastanejBazyOpis::naglowek(
            przed: ['users' => 26, 'lesson_progress' => 621, 'supervision_signups' => 133],
            po: ['users' => 0, 'lesson_progress' => 0, 'supervision_signups' => 0],
        );

        $this->assertStringNotContainsString(
            'DOPISAŁ',
            $naglowek,
            'Ubytek nazwany jak dopisanie wysyła czytającego szukać sprzątania, które nie jest problemem.',
        );
        $this->assertStringContainsString('WYCZYŚCIŁ', $naglowek);
    }

    public function test_growth_and_shrinkage_together_are_named_as_mixed_not_as_either_alone(): void
    {
        $naglowek = StanZastanejBazyOpis::naglowek(
            przed: ['users' => 5, 'lesson_progress' => 621],
            po: ['users' => 8, 'lesson_progress' => 0],
        );

        $this->assertStringContainsString('MIESZANY', $naglowek);
    }
}
