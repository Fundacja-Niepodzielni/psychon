<?php

namespace Tests\Feature\Przyrzad;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\ParallelTesting;
use PHPUnit\Framework\AssertionFailedError;
use PHPUnit\Framework\Attributes\Group;
use RuntimeException;
use Tests\Atrapy\AtrapaZPustaDeklaracja;
use Tests\Atrapy\StrazniczaAtrapa;
use Tests\TestCase;

/**
 * Świadek DRUGIEGO punktu kontrolnego strażnika — tego, który stoi między przełączeniem
 * bazy przez runner równoległy a jej wyczyszczeniem przez `RefreshDatabase`.
 *
 * DLACZEGO NIE PRZEBIEGIEM POTOMNYM (jak `GuardBehaviourTest`). Kontrola negatywna
 * kryterium 3 („pusta deklaracja pod `--parallel` nadal przerywa") była do 05.09 pomiarem
 * RĘCZNYM: ktoś podmieniał `phpunit.xml`, puszczał suitę i oglądał kod wyjścia. Pomiar,
 * który wymaga podmiany pliku konfiguracji w drzewie roboczym, nie może stać w bramce:
 * przerwany w połowie zostawia repo z zepsutą deklaracją, a wtedy CZERWONE jest wszystko.
 * Dlatego świadek podstawia deklarację NADPISANIEM METODY w atrapie (`tests/Atrapy`),
 * a nie zmienną środowiskową i nie edycją pliku — furtka sterowana środowiskiem byłaby
 * pułapką P-1 od kuchni.
 *
 * Token równoległy ustawiamy tak, jak robi to sam runner
 * (`Illuminate/Testing/Concerns/RunsInParallel.php:151` → `resolveTokenUsing`).
 *
 * ⚠ Bez `RefreshDatabase` celowo: świadek przestawia połączenie na bazę `postgres`,
 * a cecha owijająca test w transakcję nie przeżyłaby `DB::purge()`.
 *
 * `php artisan test --filter=GuardUnderParallel`
 */
// Bez cechy bazodanowej runner rownolegly nie przelacza tej klasy na wlasna baze
// procesu (`TestDatabases.php:56`), wiec zostaje na bazie WSPOLNEJ i sciga sie z
// sasiadami. Grupa `wspolna-baza` wypada z kroku A bramki i biegnie sekwencyjnie w B.
// Regula pilnowana mechanicznie: `tests/Feature/Przyrzad/GrupaWspolnejBazyTest.php`.
#[Group('wspolna-baza')]
final class GuardUnderParallelTest extends TestCase
{
    private const TOKEN = 3;

    public function test_pusta_deklaracja_przerywa_takze_pod_runnerem_rownoleglym(): void
    {
        $this->zTokenemRownoleglym(function (): void {
            try {
                (new AtrapaZPustaDeklaracja('atrapa'))->przejdzPunktKontrolnyPrzedCzyszczeniem($this->app);
            } catch (RuntimeException $wyjatek) {
                $this->assertStringContainsString(
                    'Pusta deklaracja jest błędem, nie zgodą',
                    $wyjatek->getMessage(),
                );

                return;
            }

            $this->fail(
                'Pusta deklaracja pod runnerem równoległym NIE przerwała. To jest lekcja Z-6a: '
                .'brak deklaracji nigdy nie jest zgodą na dowolną bazę.',
            );
        });
    }

    public function test_baza_spoza_rodziny_deklaracji_przerywa_tuz_przed_czyszczeniem(): void
    {
        // `postgres` istnieje w każdej instalacji PostgreSQL i jest bezpieczna do
        // odpytania (`select current_database()` niczego nie zmienia). Chodzi o to,
        // żeby silnik ODPOWIEDZIAŁ nazwą spoza rodziny deklaracji — a nie o to,
        // żeby połączenie padło; awaria połączenia to inny komunikat strażnika.
        $this->naPolaczeniuDoBazy('postgres', function (): void {
            $this->zTokenemRownoleglym(function (): void {
                try {
                    (new StrazniczaAtrapa('atrapa'))->przejdzPunktKontrolnyPrzedCzyszczeniem($this->app);
                } catch (AssertionFailedError $wyjatek) {
                    $this->assertStringContainsString('PRZERWANE tuż przed `RefreshDatabase`', $wyjatek->getMessage());
                    $this->assertStringContainsString('postgres', $wyjatek->getMessage());

                    return;
                }

                $this->fail(
                    'Drugi punkt kontrolny przepuścił bazę spoza deklaracji. Pod `--parallel` '
                    .'znaczyłoby to, że `RefreshDatabase` czyści bazę, której nikt nie pilnuje.',
                );
            });
        });
    }

    public function test_baza_zadeklarowana_przechodzi_takze_z_ustawionym_tokenem(): void
    {
        // Kontrola pozytywna. Bez niej warunek „przerywa na obcej bazie" spełniałby też
        // strażnik, który pod `--parallel` przerywa ZAWSZE — a taki wygląda w logu
        // identycznie jak prawdziwa awaria.
        $this->zTokenemRownoleglym(function (): void {
            (new StrazniczaAtrapa('atrapa'))->przejdzPunktKontrolnyPrzedCzyszczeniem($this->app);

            $this->assertSame(
                [self::declaredDatabase(), self::declaredDatabase().'_test_'.self::TOKEN],
                self::allowedDatabases(),
                'Dopuszczenie pod tokenem równoległym nie zgadza się z nazwą, którą runner generuje.',
            );
        });
    }

    private function zTokenemRownoleglym(callable $co): void
    {
        ParallelTesting::resolveTokenUsing(fn () => self::TOKEN);

        try {
            $co();
        } finally {
            // Przywracamy odczyt tokena ze środowiska (`$_SERVER['TEST_TOKEN']`), czyli stan,
            // w którym zostawia go runner. Bez tego reszta testów w TYM procesie liczyłaby
            // dopuszczenie z cudzego tokena.
            ParallelTesting::resolveTokenUsing(null);
        }
    }

    private function naPolaczeniuDoBazy(string $baza, callable $co): void
    {
        $klucz = 'database.connections.'.config('database.default').'.database';
        $bylo = (string) config($klucz);

        DB::purge();
        config()->set($klucz, $baza);

        try {
            $co();
        } finally {
            DB::purge();
            config()->set($klucz, $bylo);
        }
    }
}
