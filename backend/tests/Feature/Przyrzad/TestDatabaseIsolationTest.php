<?php

namespace Tests\Feature\Przyrzad;

use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

/**
 * Świadek PRZYRZĄDU, nie funkcji produktu (pułapka P-1, `WYTYCZNE-PRACY-PSYCHON` §7.1).
 *
 * Mierzy jedno: czy suita biegnie na bazie, na której DEKLARUJE, że biegnie.
 * Kontrola negatywna wykonuje się z zewnątrz, wstrzyknięciem zmiennej kontenera:
 *
 *   docker compose -p psytesty exec -T -e DB_DATABASE=niepodzielni app \
 *       php artisan test --filter=TestDatabaseIsolation
 *
 * Bez `force="true"` w `phpunit.xml` ten przebieg jest CZERWONY (wstrzyknięta
 * zmienna wygrywa), z `force="true"` — ZIELONY. Czerwień jest tu dowodem,
 * że przyrząd w ogóle mierzy.
 *
 * `php artisan test --filter=TestDatabaseIsolation`
 *
 * ⚠ Ten plik CELOWO nie używa `RefreshDatabase`: gdyby pułapka była otwarta,
 * odświeżenie bazy skasowałoby dane demo, zanim ktokolwiek zobaczyłby czerwień.
 * Świadek ma ostrzegać, nie kasować.
 */
// Bez cechy bazodanowej runner rownolegly nie przelacza tej klasy na wlasna baze
// procesu (`TestDatabases.php:56`), wiec zostaje na bazie WSPOLNEJ i sciga sie z
// sasiadami. Grupa `wspolna-baza` wypada z kroku A bramki i biegnie sekwencyjnie w B.
// Regula pilnowana mechanicznie: `tests/Feature/Przyrzad/GrupaWspolnejBazyTest.php`.
#[Group('wspolna-baza')]
final class TestDatabaseIsolationTest extends TestCase
{
    public function test_the_engine_reports_the_dedicated_testing_database(): void
    {
        $measured = (string) DB::selectOne('select current_database() as name')->name;

        $this->assertSame(
            self::declaredDatabase(),
            $measured,
            'Testy biegną na bazie "'.$measured.'". Zmienna środowiskowa kontenera wygrała '
            .'z wpisem <env> w phpunit.xml — to jest pułapka P-1.',
        );
    }

    public function test_the_demo_database_is_never_the_target(): void
    {
        // Kontrola pozytywna wyżej mówi „to jest właściwa baza".
        // Ta mówi „to na pewno NIE jest baza demo" — i zostaje czerwona także wtedy,
        // gdy ktoś w przyszłości przemianuje bazę testową, ale wskaże ją na demo.
        $measured = (string) DB::selectOne('select current_database() as name')->name;

        $this->assertNotSame('niepodzielni', $measured, 'Suita celuje w bazę demo — dane seedowe są zagrożone.');
    }

    public function test_configuration_and_engine_agree(): void
    {
        // Rozjazd między tym, co mówi konfiguracja, a tym, co mówi silnik, jest
        // objawem tej samej klasy: konfiguracja opisuje zamiar, silnik — fakt.
        $declared = (string) config('database.connections.'.config('database.default').'.database');
        $measured = (string) DB::selectOne('select current_database() as name')->name;

        $this->assertSame(
            $declared,
            $measured,
            'Konfiguracja deklaruje bazę "'.$declared.'", a połączenie stoi na "'.$measured.'".',
        );
    }

    public function test_every_env_entry_in_phpunit_xml_is_forced(): void
    {
        // Świadek samej naprawy T-0: gdyby ktoś dopisał kolejny <env> bez force="true",
        // pułapka P-1 wróciłaby innym wejściem. Kontrola jest allowlistą (§8.1):
        // pyta „czy WSZYSTKIE wpisy są wymuszone", nie „czy ten jeden jest".
        $path = base_path('phpunit.xml');
        $this->assertFileExists($path);

        $xml = new \SimpleXMLElement((string) file_get_contents($path));
        $entries = $xml->xpath('//php/env') ?: [];

        $this->assertNotEmpty($entries, 'phpunit.xml nie ma wpisów <env> — kontrola nie ma czego mierzyć.');

        $unforced = [];
        foreach ($entries as $entry) {
            if (((string) ($entry['force'] ?? '')) !== 'true') {
                $unforced[] = (string) $entry['name'];
            }
        }

        $this->assertSame(
            [],
            $unforced,
            'Wpisy <env> bez force="true" (zmienna kontenera je przebije): '.implode(', ', $unforced),
        );
    }
}
