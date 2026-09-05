<?php

namespace Tests\Feature\Przyrzad;

use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Group;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ReflectionClass;
use SplFileInfo;
use Tests\Feature\H13\EmptyEditionConcurrentCertificateTest;
use Tests\Feature\H14\ConcurrentDocumentNumberTest;
use Tests\TestCase;

/**
 * Świadek PODZIAŁU bramki na dwa kroki — kontrola mechaniczna, nie lista w piśmie.
 *
 * REGUŁA. Runner równoległy przełącza na własną bazę procesu WYŁĄCZNIE klasy z cechą
 * bazodanową; cytat ze źródła (własny `grep -n`):
 *   `vendor/laravel/framework/src/Illuminate/Testing/Concerns/TestDatabases.php:56`
 *     → `if (Arr::hasAny($uses, $databaseTraits) && ! ParallelTesting::option('without_databases'))`
 * Klasa BEZ takiej cechy zostaje więc na bazie WSPÓLNEJ — razem ze wszystkimi innymi
 * takimi klasami, w sześciu procesach naraz. Wtedy nie mierzy już swojego niezmiennika,
 * tylko to, co akurat robi sąsiad: zmierzone jako zakleszczenie, złamany
 * `certificates_number_unique` i „stan zastany bazy nie był pusty".
 *
 * Dlatego każda taka klasa musi być w grupie `wspolna-baza`, którą krok równoległy
 * WYKLUCZA, a krok sekwencyjny uruchamia:
 *   A: `php artisan test --parallel --processes=6 --exclude-group=wspolna-baza`
 *   B: `php artisan test --group=wspolna-baza`
 *
 * DLACZEGO KONTROLA, A NIE ZDANIE W DOKUMENTACJI. Pierwsza wersja podziału wyliczała
 * dwie klasy z ręki (`H13`, `H14`) — te, które akurat się zderzyły. Krok A zaczerwienił
 * się natychmiast na TRZECIEJ (`H10\FirstAttemptRaceTest`), o której nikt nie pomyślał.
 * Wyliczanka jest denylistą: broni tego, co autor zdążył sobie wyobrazić. Ten test pyta
 * o WŁAŚCIWOŚĆ (brak cechy bazodanowej), więc obejmuje też klasę, która powstanie jutro.
 *
 * `php artisan test --filter=GrupaWspolnejBazy`
 */
#[Group('wspolna-baza')]
final class GrupaWspolnejBazyTest extends TestCase
{
    private const GRUPA = 'wspolna-baza';

    /** @var list<class-string> */
    private const CECHY_BAZODANOWE = [
        RefreshDatabase::class,
        DatabaseTransactions::class,
        DatabaseMigrations::class,
        DatabaseTruncation::class,
    ];

    public function test_kazda_klasa_bez_cechy_bazodanowej_jest_w_grupie_wspolnej_bazy(): void
    {
        $bezGrupy = [];
        $sprawdzonych = 0;

        foreach ($this->klasyTestowe() as $klasa) {
            $sprawdzonych++;

            if ($this->maCecheBazodanowa($klasa)) {
                continue;
            }

            if (! in_array(self::GRUPA, $this->grupy($klasa), true)) {
                $bezGrupy[] = $klasa;
            }
        }

        $this->assertGreaterThan(
            50,
            $sprawdzonych,
            'Skan nie znalazł klas testowych — kontrola nie ma czego mierzyć, a wygląda na zieloną.',
        );

        sort($bezGrupy);

        $this->assertSame(
            [],
            $bezGrupy,
            'Te klasy nie mają cechy bazodanowej, więc runner równoległy zostawi je na bazie WSPÓLNEJ, '
            .'gdzie będą się tłukły z sąsiadami zamiast mierzyć swój niezmiennik. Dopisz im '
            ."#[Group('".self::GRUPA."')] albo cechę bazodanową:\n  ".implode("\n  ", $bezGrupy),
        );
    }

    public function test_swiadkowie_wspolbieznosci_z_kryterium_sa_w_grupie(): void
    {
        // Kontrola pozytywna do powyższej: gdyby skan nic nie znajdował (zła ścieżka,
        // zmieniona konwencja nazw), pierwszy test byłby zielony na pustym zbiorze.
        foreach ([
            EmptyEditionConcurrentCertificateTest::class,
            ConcurrentDocumentNumberTest::class,
        ] as $klasa) {
            $this->assertContains(self::GRUPA, $this->grupy($klasa), $klasa.' wypadła z grupy '.self::GRUPA);
        }
    }

    /** @return list<class-string> */
    private function klasyTestowe(): array
    {
        $korzen = base_path('tests');
        $klasy = [];

        /** @var SplFileInfo $plik */
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($korzen)) as $plik) {
            if (! $plik->isFile() || ! str_ends_with($plik->getFilename(), 'Test.php')) {
                continue;
            }

            $wzgledna = str_replace('\\', '/', substr($plik->getPathname(), strlen($korzen) + 1));

            // Skanujemy dokładnie to, co uruchamia bramka: oba testsuite'y z `phpunit.xml`.
            if (! str_starts_with($wzgledna, 'Unit/') && ! str_starts_with($wzgledna, 'Feature/')) {
                continue;
            }

            $klasa = 'Tests\\'.str_replace('/', '\\', substr($wzgledna, 0, -4));

            if (! class_exists($klasa)) {
                continue;
            }

            $refleksja = new ReflectionClass($klasa);

            // Testy jednostkowe na `PHPUnit\Framework\TestCase` nie podnoszą aplikacji
            // ani połączenia, więc nie mają czego dzielić z sąsiadem.
            if ($refleksja->isAbstract() || ! $refleksja->isSubclassOf(TestCase::class)) {
                continue;
            }

            $klasy[] = $klasa;
        }

        return $klasy;
    }

    /** @param class-string $klasa */
    private function maCecheBazodanowa(string $klasa): bool
    {
        $cechy = class_uses_recursive($klasa);

        foreach (self::CECHY_BAZODANOWE as $cecha) {
            if (isset($cechy[$cecha])) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  class-string  $klasa
     * @return list<string>
     */
    private function grupy(string $klasa): array
    {
        $grupy = [];

        foreach ((new ReflectionClass($klasa))->getAttributes(Group::class) as $atrybut) {
            $grupy[] = $atrybut->newInstance()->name();
        }

        return $grupy;
    }
}
