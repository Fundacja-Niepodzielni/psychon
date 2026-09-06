<?php

namespace Tests\Concerns;

use RuntimeException;

/**
 * Zbiór nazw baz, na których suicie WOLNO biec — WYPROWADZONY z deklaracji.
 *
 * Pod `--parallel` każdy proces dostaje własną bazę: runner dokleja do nazwy
 * przyrostek, który sam generuje. Format jest odczytany ze źródła frameworka,
 * nie zgadnięty:
 *   `vendor/laravel/framework/src/Illuminate/Testing/Concerns/TestDatabases.php:208`
 *     → `return "{$database}_test_{$token}";`
 *   `vendor/laravel/framework/src/Illuminate/Testing/ParallelTesting.php:297`
 *     → `token()` (albo `$_SERVER['TEST_TOKEN']`, albo resolver runnera)
 *   `vendor/laravel/framework/src/Illuminate/Testing/Concerns/RunsInParallel.php:149-151`
 *     → przydział tokenów 1..N w procesie nadrzędnym
 *
 * DLACZEGO WYPROWADZENIE, A NIE DRUGA LISTA NAZW — kryterium: jedno źródło prawdy.
 * Lista dopisana obok deklaracji byłaby DRUGIM źródłem prawdy: w dniu, w którym
 * ktoś zmieni `DB_DATABASE` w `phpunit.xml`, lista zostałaby stara i strażnik
 * przepuściłby bazę, której nikt już nie deklaruje. Tu każda dopuszczona nazwa
 * powstaje Z deklaracji — zmiana deklaracji przenosi się na całe dopuszczenie
 * automatycznie, a nazwa spoza tej rodziny nie ma jak wejść.
 *
 * Pusta deklaracja NIE daje pustego dopuszczenia (to byłoby „wszystko wolno"
 * przez pomyłkę) — rzuca. „Nie napisano, na czym mamy biec" nie jest zgodą.
 *
 * Świadek: `tests/Unit/Przyrzad/AllowedTestDatabasesTest.php`.
 */
final class AllowedTestDatabases
{
    /** Przyrostek runnera — cytat z `TestDatabases.php:208`, nie wynalazek strażnika. */
    private const PRZYROSTEK = '_test_';

    /**
     * @param  string  $declared  nazwa z `phpunit.xml`
     * @param  string|int|false|null  $token  wynik `ParallelTesting::token()` (`false` = przebieg sekwencyjny)
     * @return list<string>
     *
     * @throws RuntimeException gdy deklaracja jest pusta
     */
    public static function derive(string $declared, string|int|false|null $token): array
    {
        $declared = trim($declared);

        if ($declared === '') {
            throw new RuntimeException(
                'Pusta deklaracja bazy testowej nie tworzy dopuszczenia. Gdyby tworzyła, '
                .'strażnik przepuściłby DOWOLNĄ bazę dokładnie wtedy, gdy nikt nie napisał, '
                .'na czym suita ma biec — czyli w chwili największego ryzyka.',
            );
        }

        $token = ($token === false || $token === null) ? '' : trim((string) $token);

        if ($token === '') {
            return [$declared];
        }

        return [$declared, $declared.self::PRZYROSTEK.$token];
    }
}
