<?php

namespace Tests;

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;
use RuntimeException;
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

    /**
     * Liczności tabel z chwili startu testu — tylko dla klas BEZ `RefreshDatabase`.
     *
     * @var array<string, int>|null
     */
    private ?array $stanZastanyBazy = null;

    protected function setUp(): void
    {
        parent::setUp();

        if (! $this->uzywaOdswiezaniaBazy()) {
            $this->stanZastanyBazy = $this->policzWiersze();
        }
    }

    protected function tearDown(): void
    {
        $rozjazd = $this->stanZastanyBazy === null ? [] : $this->rozjazdStanu($this->stanZastanyBazy);

        parent::tearDown();

        if ($rozjazd !== []) {
            throw new RuntimeException(
                'Test bez `RefreshDatabase` zostawił po sobie ślad w bazie testowej:
  '
                .implode('
  ', $rozjazd)
                .'
Następne testy zastaną niepusty stan i zaczerwienią się bez własnej winy. '
                .'Sprzątnij w `tearDown` albo dołóż `RefreshDatabase`. '
                .'(Reguła P-6: test wołający `seed()` MUSI mieć `RefreshDatabase`; '
                .'jeśli mieć go nie może — nie wolno mu wołać `seed()`.)',
            );
        }
    }

    /**
     * Przywraca bazę do stanu zastanego na starcie testu.
     *
     * Do wywołania w `tearDown` świadków, które świadomie nie mają `RefreshDatabase`
     * (procesy potomne nie zobaczyłyby otwartej transakcji rodzica). Zastępuje
     * ręczne listy `Model::where(...)->delete()` — każda taka lista prędzej czy później
     * pomija tabelę, o której autor nie pomyślał. Zmierzone dwa razy w jeden dzień:
     * najpierw `seed()` bez sprzątania, potem wpisy audytu, o których nikt nie pamiętał;
     * drugi raz kosztował 8 cudzych testów.
     *
     * Działa wyłącznie, gdy stan zastany był PUSTY — a taki właśnie zostawia
     * `RefreshDatabase` poprzedniego testu. Przy niepustym rzuca, zamiast zgadywać,
     * co wolno skasować: przyrząd nie ma prawa kasować cudzych danych „na wszelki wypadek".
     */
    protected function przywrocStanZastanejBazy(): void
    {
        if ($this->stanZastanyBazy === null) {
            return; // klasa z `RefreshDatabase` — sprzątanie robi cecha
        }

        if (array_sum($this->stanZastanyBazy) !== 0) {
            throw new RuntimeException(
                'Stan zastany bazy nie był pusty, więc nie umiem go przywrócić bez zgadywania, '
                .'co wolno skasować. Posprzątaj w `tearDown` tego testu jawnie.',
            );
        }

        $tabele = array_keys($this->stanZastanyBazy);

        if ($tabele === []) {
            return;
        }

        DB::statement(
            'truncate table "'.implode('", "', $tabele).'" restart identity cascade'
        );
    }

    /**
     * Czy klasa testu odświeża bazę transakcją — wtedy sprzątanie robi cecha,
     * a strażnik nie ma czego pilnować.
     */
    private function uzywaOdswiezaniaBazy(): bool
    {
        foreach (class_uses_recursive(static::class) as $cecha) {
            if ($cecha === RefreshDatabase::class || $cecha === DatabaseTransactions::class) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, int>  $przed
     * @return list<string>
     */
    private function rozjazdStanu(array $przed): array
    {
        try {
            $po = $this->policzWiersze();
        } catch (Throwable) {
            return []; // baza nieosiągalna — to inna awaria i ma własny komunikat
        }

        $rozjazd = [];

        foreach ($po as $tabela => $ile) {
            $bylo = $przed[$tabela] ?? 0;

            if ($ile !== $bylo) {
                $rozjazd[] = sprintf('%s: było %d, jest %d (%+d)', $tabela, $bylo, $ile, $ile - $bylo);
            }
        }

        return $rozjazd;
    }

    /**
     * Liczności wszystkich tabel schematu publicznego jednym zapytaniem.
     *
     * Jednym, bo strażnik ma być tani: klas bez `RefreshDatabase` jest garść,
     * ale gdyby kosztował po zapytaniu na tabelę, ktoś by go wyłączył.
     *
     * @return array<string, int>
     */
    private function policzWiersze(): array
    {
        $tabele = collect(DB::select(
            "select tablename from pg_tables where schemaname = 'public' and tablename <> 'migrations' order by tablename"
        ))->pluck('tablename');

        if ($tabele->isEmpty()) {
            return [];
        }

        $zapytanie = $tabele
            ->map(static fn (string $t): string => 'select '.DB::getPdo()->quote($t).' as tabela, count(*) as ile from "'.$t.'"')
            ->implode(' union all ');

        return collect(DB::select($zapytanie))
            ->mapWithKeys(static fn (object $w): array => [(string) $w->tabela => (int) $w->ile])
            ->all();
    }

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
