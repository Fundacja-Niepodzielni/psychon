<?php

namespace Tests\Feature\Przyrzad;

use Illuminate\Contracts\Process\ProcessResult;
use Illuminate\Support\Facades\Process;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

/**
 * Świadek ZACHOWANIA strażnika izolacji, nie samej nazwy bazy.
 *
 * `TestDatabaseIsolationTest` odpowiada na pytanie „czy biegniemy na właściwej bazie".
 * Ten plik odpowiada na trudniejsze: „czy strażnik ODRÓŻNIA dwie awarie, które wyglądają
 * podobnie" — podmienioną bazę (pułapka P-1, cicha) od niedostępnego serwera (głośna).
 * Strażnik, który obie nazywa pułapką P-1, wysyła czytającego na poszukiwanie błędu,
 * którego nie ma.
 *
 * Pomiar musi iść przez OSOBNY PROCES, bo strażnik mierzy bazę raz na proces i w tym
 * procesie zmierzył ją już poprawnie. Wstrzyknięcie zmiennej po starcie niczego by nie
 * zmieniło — mierzyłoby pamięć, nie zachowanie.
 *
 * Podstawa: `ZLECENIE-005` §1 (wyjątek topologiczny przyjęty pod warunkiem, że przypadek
 * „zły host → awaria głośna, nie P-1" zostaje w suicie, a nie tylko w meldunku).
 *
 * KOSZT. Każdy przypadek to osobny przebieg `artisan test`, czyli ~25 s. Dlatego są
 * DWA, nie trzy: warunek „każdy przebieg ogłasza zmierzoną bazę" jest sprawdzany przy
 * okazji drugiego, zamiast trzecim procesem. Świadek przyrządu ma być tani na tyle,
 * żeby nikt nie miał pokusy wyłączyć go z bramki.
 *
 * `php artisan test --filter=GuardBehaviour`
 */
// Bez cechy bazodanowej runner rownolegly nie przelacza tej klasy na wlasna baze
// procesu (`TestDatabases.php:56`), wiec zostaje na bazie WSPOLNEJ i sciga sie z
// sasiadami. Grupa `wspolna-baza` wypada z kroku A bramki i biegnie sekwencyjnie w B.
// Regula pilnowana mechanicznie: `tests/Feature/Przyrzad/GrupaWspolnejBazyTest.php`.
#[Group('wspolna-baza')]
final class GuardBehaviourTest extends TestCase
{
    /** Test w procesie potomnym: lekki, bez `RefreshDatabase`, więc niczego nie kasuje. */
    private const CHILD_FILTER = 'test_the_engine_reports';

    public function test_an_unreachable_host_is_reported_as_a_connection_failure_not_as_the_p1_trap(): void
    {
        // DB_HOST jest własnością środowiska (wyjątek topologiczny), więc wstrzyknięcie
        // przechodzi do potomka i połączenie ma prawo paść. Chodzi o to, JAK pada.
        $result = $this->runChildSuiteWith(['DB_HOST' => '127.0.0.1']);

        $this->assertNotSame(0, $result->exitCode(), 'Niedostępny serwer musi zaczerwienić suitę.');

        $output = $result->output().$result->errorOutput();

        $this->assertStringContainsString(
            'To NIE jest pułapka P-1',
            $output,
            'Strażnik przedstawił awarię połączenia jako pułapkę P-1 — to wysyła szukającego w złe miejsce.',
        );
    }

    public function test_a_swapped_database_is_reported_as_the_p1_trap(): void
    {
        // Kontrola pozytywna do powyższej. Bez niej „nie mówi P-1" spełniłby też
        // strażnik, który nie mówi P-1 NIGDY.
        $result = $this->runChildSuiteWith(['DB_DATABASE' => 'niepodzielni']);

        $output = $result->output().$result->errorOutput();

        // Po naprawie T-0 wpis z phpunit.xml wygrywa, więc podmiana NIE przechodzi
        // i suita jest zielona. To jest właściwy wynik — pułapka jest zamknięta.
        $this->assertSame(
            0,
            $result->exitCode(),
            'Wstrzyknięty DB_DATABASE przebił phpunit.xml — pułapka P-1 jest znów otwarta. Wyjście: '.$output,
        );

        $this->assertStringContainsString(
            'baza testowa zmierzona silnikiem: '.self::declaredDatabase(),
            $output,
            'Log przebiegu nie niesie nazwy bazy zmierzonej silnikiem.',
        );
    }

    /** @param array<string, string> $env */
    private function runChildSuiteWith(array $env): ProcessResult
    {
        return Process::path(base_path())
            ->env($env)
            ->timeout(120)
            ->run([PHP_BINARY, 'artisan', 'test', '--filter='.self::CHILD_FILTER]);
    }
}
