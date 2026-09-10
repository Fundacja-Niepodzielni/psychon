<?php

namespace Tests\Concerns;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\ParallelTesting;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;
use Throwable;

/**
 * Ogłoszenie `[PRZYRZĄD] baza testowa zmierzona silnikiem: …` RAZ NA PROCES —
 * także wtedy, gdy suita biegnie pod `--parallel`.
 *
 * DLACZEGO NIE WYSTARCZY OGŁOSZENIE ZE STRAŻNIKA. Pod `--parallel` testy biegną
 * w workerach ParaTesta, a te mają przechwycone wyjście: `fwrite(STDERR)` z workera
 * do logu bramki NIE dociera (pomiar: `grep -c "PRZYRZĄD"` w logu równoległym = 0).
 * Przyrząd, którego nie widać w logu, przestaje być przyrządem — zostaje wiara.
 *
 * Dlatego ogłoszenie idzie z procesu NADRZĘDNEGO, przez `ParallelTesting::setUpProcess()`.
 * Cytaty ze źródła frameworka (własny `grep -n`, nie przepisane):
 *   `Illuminate/Testing/Concerns/RunsInParallel.php:112-114` → `forEachProcess(fn () => ParallelTesting::callSetUpProcessCallbacks())`
 *   `Illuminate/Testing/Concerns/RunsInParallel.php:149-151` → pętla po tokenach 1..N i `resolveTokenUsing`
 *   `Illuminate/Testing/ParallelTesting.php:176`            → `callSetUpProcessCallbacks()` (tylko pod `--parallel`)
 * Efekt: tyle linii `[PRZYRZĄD]`, ile procesów, każda z INNĄ nazwą bazy.
 *
 * Nazwa jest MIERZONA, nie wypisana z konfiguracji: łączymy się do bazy procesu
 * i pytamy ją samą (`select current_database()`). Wypisanie nazwy z konfiguracji
 * byłoby powtórzeniem cudzego zamiaru — a to jest dokładnie sytuacja, w której
 * zamiar (deklaracja) i fakt (baza, na której faktycznie stoi połączenie) się rozjeżdżają.
 *
 * Świadek: `tests/Feature/Przyrzad/GuardUnderParallelTest.php`.
 */
final class ProcessDatabaseAnnouncement
{
    public static function announce(): void
    {
        $default = (string) config('database.default');
        $klucz = 'database.connections.'.$default.'.database';
        $bylo = (string) config($klucz);

        $dopuszczone = AllowedTestDatabases::derive(TestCase::declaredDatabase(), ParallelTesting::token());
        $bazaProcesu = $dopuszczone[array_key_last($dopuszczone)];

        $zmierzona = self::zmierz($klucz, $bazaProcesu);

        if ($zmierzona === null) {
            // Baza procesu jeszcze nie istnieje: runner tworzy ją dopiero przy PIERWSZYM
            // teście w workerze (`TestDatabases.php:94-113`), a ogłoszenie ma stać w logu
            // wcześniej. Tworzymy więc dokładnie to samo, co i tak powstanie za chwilę —
            // pusta baza, którą `RefreshDatabase` zaraz zmigruje. Bez tego pierwszy przebieg
            // na świeżym stosie miałby przyrząd czerwony, mimo że kod nic nie zawinił —
            // baza po prostu jeszcze nie istniała w chwili ogłoszenia.
            self::przywroc($klucz, $bylo);
            Schema::createDatabase($bazaProcesu);
            $zmierzona = self::zmierz($klucz, $bazaProcesu);
        }

        self::przywroc($klucz, $bylo);

        fwrite(
            STDERR,
            PHP_EOL.'[PRZYRZĄD] baza testowa zmierzona silnikiem: '.($zmierzona ?? '(brak połączenia)').PHP_EOL,
        );
    }

    /** Pomiar przez połączenie: null znaczy „nie da się połączyć", nie „nazwa się nie zgadza". */
    private static function zmierz(string $klucz, string $baza): ?string
    {
        self::przywroc($klucz, $baza);

        try {
            return (string) DB::selectOne('select current_database() as name')->name;
        } catch (Throwable) {
            return null;
        }
    }

    private static function przywroc(string $klucz, string $baza): void
    {
        DB::purge();
        config()->set($klucz, $baza);
    }
}
