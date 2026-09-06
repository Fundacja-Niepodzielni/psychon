<?php

namespace Tests\Unit\Przyrzad;

use PHPUnit\Framework\TestCase;
use RuntimeException;
use Tests\Concerns\AllowedTestDatabases;

/**
 * Świadek WYPROWADZENIA dopuszczonych nazw baz (kryterium: „allowlist wyprowadzona
 * z deklaracji, nigdy druga lista nazw").
 *
 * Sedno jest w teście `dopuszczenie_wedruje_za_deklaracja`: gdyby dopuszczenie było
 * dopisaną listą nazw, zmiana deklaracji zostawiłaby w nim starą nazwę — i strażnik
 * przepuściłby bazę, której nikt już nie deklaruje.
 *
 * `php artisan test --filter=AllowedTestDatabases`
 */
final class AllowedTestDatabasesTest extends TestCase
{
    public function test_przebieg_sekwencyjny_dopuszcza_wylacznie_deklaracje(): void
    {
        // `ParallelTesting::token()` zwraca `false` poza przebiegiem równoległym
        // (`Illuminate/Testing/ParallelTesting.php:297`), a wtedy żadna postać
        // per proces nie ma prawa być dopuszczona.
        $this->assertSame(
            ['niepodzielni_testing'],
            AllowedTestDatabases::derive('niepodzielni_testing', false),
        );
    }

    public function test_przebieg_rownolegly_dopuszcza_postac_per_proces(): void
    {
        $this->assertSame(
            ['niepodzielni_testing', 'niepodzielni_testing_test_3'],
            AllowedTestDatabases::derive('niepodzielni_testing', 3),
        );
    }

    public function test_dopuszczenie_wedruje_za_deklaracja(): void
    {
        $dopuszczone = AllowedTestDatabases::derive('inna_baza_testowa', 2);

        $this->assertSame(['inna_baza_testowa', 'inna_baza_testowa_test_2'], $dopuszczone);

        foreach ($dopuszczone as $nazwa) {
            $this->assertStringStartsWith(
                'inna_baza_testowa',
                $nazwa,
                'Dopuszczenie zawiera nazwę, która nie pochodzi z deklaracji — to znaczy, '
                .'że gdzieś siedzi druga lista nazw.',
            );
        }
    }

    public function test_pusta_deklaracja_nie_daje_zadnego_dopuszczenia(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Pusta deklaracja bazy testowej nie tworzy dopuszczenia');

        AllowedTestDatabases::derive('   ', 4);
    }

    public function test_pusty_token_nie_tworzy_nazwy_z_ogonem(): void
    {
        // Bez tego `niepodzielni_testing_test_` (token pusty) byłoby nazwą dopuszczoną,
        // a taka baza nie należy do nikogo.
        $this->assertSame(['niepodzielni_testing'], AllowedTestDatabases::derive('niepodzielni_testing', ''));
        $this->assertSame(['niepodzielni_testing'], AllowedTestDatabases::derive('niepodzielni_testing', null));
    }

    public function test_format_przyrostka_zgadza_sie_ze_zrodlem_frameworka(): void
    {
        // Wyprowadzenie kopiuje format runnera. Gdyby aktualizacja Laravela zmieniła ten
        // format, dopuszczenie przestałoby pasować do bazy, którą runner naprawdę tworzy —
        // i strażnik przerywałby CAŁĄ suitę bez winy kodu. Ten test zapala się przy
        // aktualizacji, a nie w bramce o 2 w nocy.
        $zrodlo = dirname(__DIR__, 3)
            .'/vendor/laravel/framework/src/Illuminate/Testing/Concerns/TestDatabases.php';

        $this->assertFileExists($zrodlo);

        $this->assertStringContainsString(
            'return "{$database}_test_{$token}";',
            (string) file_get_contents($zrodlo),
            'Runner nie generuje już nazw w postaci `…_test_TOKEN` — wyprowadzenie w '
            .'`AllowedTestDatabases` opisuje framework, którego już nie ma.',
        );
    }
}
