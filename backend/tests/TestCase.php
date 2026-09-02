<?php

namespace Tests;

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Tests\Concerns\DeclaredTestDatabase;
use Throwable;

/**
 * Strażnik izolacji bazy testowej (pułapka P-1).
 *
 * Wpisy `<env>` w `phpunit.xml` BEZ `force="true"` przegrywają ze zmiennymi
 * środowiskowymi kontenera. Skutek jest cichy: `tests/bootstrap.php` tworzy
 * `niepodzielni_testing`, więc wygląda na izolację, a suita razem
 * z `RefreshDatabase` jedzie po bazie demo i kasuje jej dane.
 *
 * Dlatego nazwa bazy jest sprawdzana SILNIKIEM (`select current_database()`),
 * a nie odczytem konfiguracji — konfiguracja jest tym, co pułapka podmienia.
 * Kontrola siedzi w `createApplication()`, bo to jedyny punkt PRZED `setUpTraits()`,
 * czyli przed migracją i czyszczeniem bazy przez `RefreshDatabase`. Sprawdzenie
 * po `setUp()` byłoby autopsją, nie zabezpieczeniem.
 */
abstract class TestCase extends BaseTestCase
{
    /**
     * Baza wymagana przez `phpunit.xml` — czytana Z PLIKU przy pierwszym użyciu.
     *
     * Nie jest stałą w kodzie, bo stała byłaby DRUGIM źródłem prawdy obok deklaracji
     * i rozjechałaby się w dniu, w którym ktoś zmieni jedno z dwóch. Nie pochodzi też
     * z `config()`, bo konfiguracja czyta środowisko — czyli dokładnie to, co pułapka
     * P-1 podmienia; strażnik porównywałby wtedy nadpisane z nadpisanym.
     */
    private static ?string $declaredDatabase = null;

    /** Nazwa zmierzona raz na proces — kolejne testy nie płacą za to zapytaniem. */
    private static ?string $measuredDatabase = null;

    /** Treść błędu połączenia, jeśli pomiar w ogóle nie doszedł do skutku. */
    private static ?string $connectionFailure = null;

    public function createApplication(): Application
    {
        $app = parent::createApplication();

        if (self::$measuredDatabase === null) {
            self::$measuredDatabase = self::measureDatabase($app);
            self::announceDatabase(self::$measuredDatabase);
        }

        if (self::$measuredDatabase !== self::declaredDatabase()) {
            // Dwie różne awarie, dwa różne komunikaty. Zlanie ich w jeden zmusza
            // czytającego do zgadywania, czy patrzy na podmienioną bazę, czy na
            // martwy serwer — a to jest dokładnie ten rodzaj mylącego przyrządu,
            // przed którym ten strażnik ma bronić.
            if (self::$connectionFailure !== null) {
                $this->fail(
                    'PRZERWANE: nie udało się połączyć z bazą testową, więc nie da się '
                    .'stwierdzić, na czym biegną testy. To NIE jest pułapka P-1 — to awaria '
                    .'połączenia i pada głośno, jak powinna. Sprawdź DB_HOST/DB_PORT swojego '
                    .'środowiska.
Powód: '.self::$connectionFailure,
                );
            }

            $this->fail(sprintf(
                'PRZERWANE: testy biegną na bazie "%s", a wolno im wyłącznie na "%s". '
                .'To jest pułapka P-1: konfiguracja pomiaru przyszła z miejsca, którego pomiar '
                .'nie deklaruje (zmienna środowiskowa kontenera bije wpis z phpunit.xml). '
                .'Bez tego przerwania RefreshDatabase skasowałby dane bazy "%s".',
                self::$measuredDatabase,
                self::declaredDatabase(),
                self::$measuredDatabase,
            ));
        }

        return $app;
    }

    /**
     * Nazwa bazy zadeklarowana w `phpunit.xml`.
     *
     * Brak deklaracji albo deklaracja pusta przerywa suitę wyjątkiem — „nie napisano,
     * na czym mamy biec" nie jest zgodą na bieganie na czymkolwiek.
     */
    public static function declaredDatabase(): string
    {
        return self::$declaredDatabase ??= DeclaredTestDatabase::fromFile(
            dirname(__DIR__).DIRECTORY_SEPARATOR.'phpunit.xml',
        );
    }

    /** Nazwa bazy prosto z silnika — źródłem prawdy jest połączenie, nie plik konfiguracji. */
    private static function measureDatabase(Application $app): string
    {
        try {
            return (string) $app->make('db')->connection()->selectOne('select current_database() as name')->name;
        } catch (Throwable $exception) {
            self::$connectionFailure = $exception->getMessage();

            return '(brak połączenia)';
        }
    }

    /**
     * Nazwa bazy ma stać w logu KAŻDEGO przebiegu — meldunek cytuje bazę zmierzoną,
     * nie tę zadeklarowaną w pliku konfiguracji.
     */
    private static function announceDatabase(string $database): void
    {
        fwrite(STDERR, PHP_EOL.'[PRZYRZĄD] baza testowa zmierzona silnikiem: '.$database.PHP_EOL);
    }
}
