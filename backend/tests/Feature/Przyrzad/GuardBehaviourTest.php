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
 * podobnie" — podmienioną bazę (cicha) od niedostępnego serwera (głośna).
 * Strażnik, który obie nazywa cichą podmianą bazy, wysyła czytającego na poszukiwanie błędu,
 * którego nie ma.
 *
 * Pomiar musi iść przez OSOBNY PROCES, bo strażnik mierzy bazę raz na proces i w tym
 * procesie zmierzył ją już poprawnie. Wstrzyknięcie zmiennej po starcie niczego by nie
 * zmieniło — mierzyłoby pamięć, nie zachowanie.
 *
 * Podstawa: wyjątek topologiczny przyjęty pod warunkiem, że przypadek
 * „zły host → awaria głośna, nie cicha podmiana bazy" zostaje w suicie, a nie tylko udokumentowany.
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
        // Adres z domeny `.invalid` (RFC 2606) jest nieosiągalny Z DEFINICJI, nie z
        // topologii dzisiejszego układu maszyn. `127.0.0.1` bywa nieosiągalny w
        // kontenerze (baza stoi pod `pgsql`), ale bywa OSIĄGALNY, gdy bramka biegnie
        // natywnie i baza stoi na localhoście — wtedy ten test fałszywie czerwienieje,
        // mimo że strażnik jest bez winy. Domena `.invalid` nie rozwiąże się NIGDZIE,
        // więc wynik jest ten sam pod `pgsql` i pod `127.0.0.1`.
        $result = $this->runChildSuiteWith(['DB_HOST' => 'host-ktory-nie-istnieje.invalid']);

        $this->assertNotSame(0, $result->exitCode(), 'Niedostępny serwer musi zaczerwienić suitę.');

        $output = $result->output().$result->errorOutput();

        $this->assertStringContainsString(
            'To nie jest cicha podmiana bazy testowej',
            $output,
            'Strażnik przedstawił awarię połączenia jako cichą podmianę bazy — to wysyła szukającego w złe miejsce.',
        );
    }

    public function test_a_swapped_database_is_reported_as_the_p1_trap(): void
    {
        // Kontrola pozytywna do powyższej. Bez niej test negatywny spełniłby też
        // strażnik, który nigdy nie zgłasza cichej podmiany bazy.
        $result = $this->runChildSuiteWith(['DB_DATABASE' => 'niepodzielni']);

        $output = $result->output().$result->errorOutput();

        // Po naprawie T-0 wpis z phpunit.xml wygrywa, więc podmiana NIE przechodzi
        // i suita jest zielona. To jest właściwy wynik — pułapka jest zamknięta.
        $this->assertSame(
            0,
            $result->exitCode(),
            'Wstrzyknięty DB_DATABASE przebił phpunit.xml — cicha podmiana bazy jest znów otwarta. Wyjście: '.$output,
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
