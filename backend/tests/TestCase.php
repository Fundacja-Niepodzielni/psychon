<?php

namespace Tests;

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
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
    /** Baza wymagana przez `phpunit.xml`; nic innego nie jest dopuszczone. */
    public const TESTING_DATABASE = 'niepodzielni_testing';

    /** Nazwa zmierzona raz na proces — kolejne testy nie płacą za to zapytaniem. */
    private static ?string $measuredDatabase = null;

    public function createApplication(): Application
    {
        $app = parent::createApplication();

        if (self::$measuredDatabase === null) {
            self::$measuredDatabase = self::measureDatabase($app);
            self::announceDatabase(self::$measuredDatabase);
        }

        if (self::$measuredDatabase !== self::TESTING_DATABASE) {
            $this->fail(sprintf(
                'PRZERWANE: testy biegną na bazie "%s", a wolno im wyłącznie na "%s". '
                .'To jest pułapka P-1: wpis <env name="DB_DATABASE"> w phpunit.xml bez force="true" '
                .'przegrywa ze zmienną środowiskową kontenera. Bez tego przerwania %s straciłaby dane.',
                self::$measuredDatabase,
                self::TESTING_DATABASE,
                self::$measuredDatabase,
            ));
        }

        return $app;
    }

    /** Nazwa bazy prosto z silnika — źródłem prawdy jest połączenie, nie plik konfiguracji. */
    private static function measureDatabase(Application $app): string
    {
        try {
            return (string) $app->make('db')->connection()->selectOne('select current_database() as name')->name;
        } catch (Throwable $exception) {
            return '(brak połączenia: '.$exception->getMessage().')';
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
