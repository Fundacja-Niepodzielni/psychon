<?php

namespace Tests;

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\ParallelTesting;
use RuntimeException;
use Tests\Concerns\AllowedTestDatabases;
use Tests\Concerns\DeclaredTestDatabase;
use Tests\Concerns\ProcessDatabaseNameGuard;
use Tests\Concerns\StanZastanejBazyOpis;
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
 *
 * DRUGI PUNKT KONTROLNY (`setUpTraits()`) — powód zmierzony, nie teoretyczny.
 * Pod `--parallel` bazę podmienia sam framework, i robi to POMIĘDZY jednym punktem
 * a drugim. Kolejność z
 * `vendor/laravel/framework/src/Illuminate/Foundation/Testing/Concerns/InteractsWithTestCaseLifecycle.php:101-106`:
 *   101  `$this->refreshApplication();`                  ← tu mierzy punkt pierwszy
 *   103  `ParallelTesting::callSetUpTestCaseCallbacks($this);` ← tu framework PRZEŁĄCZA bazę
 *   106  `$this->setUpTraits();`                          ← tu czyści ją `RefreshDatabase`
 * Skutek dla samego strażnika był gorszy niż fałszywy alarm: punkt pierwszy mierzył
 * bazę bazową (`niepodzielni_testing`) i był zielony, a `RefreshDatabase` czyścił
 * bazę `…_test_N`, której NIKT nie sprawdzał. Strażnik nie blokował — przestawał
 * pilnować tej bazy, która naprawdę była kasowana.
 *
 * Dopuszczenie w obu punktach jest WYPROWADZONE z deklaracji
 * (`Tests\Concerns\AllowedTestDatabases`), nigdy dopisane jako druga lista nazw.
 *
 * ZEROWY PUNKT KONTROLNY — dopisany osobno, bo pilnuje INNEJ rzeczy: nie tego, na czym
 * biegnie POŁĄCZENIE, tylko tego, jaką nazwę runner ZAMIERZA nadać nowej bazie tego
 * procesu (`Tests\Concerns\ProcessDatabaseNameGuard`). Runner nazywa bazę z konfiguracji
 * połączenia, nie z deklaracji — rozjazd między tymi dwiema rzeczami nie objawia się
 * jako zła nazwa POŁĄCZENIA, więc punkty pierwszy i drugi mogą go nie zobaczyć.
 * Ten punkt kończy proces `exit()`-em, nie nieudaną asercją: asercja kończy tylko
 * bieżący test, a `CREATE DATABASE` pod złą nazwą zdąży się wykonać, zanim PHPUnit
 * przejdzie do następnego testu.
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
    private static array $declaredDatabases = [];

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
        $po = $this->stanZastanyBazy === null ? null : $this->zmierzStanPoTescie();
        $rozjazd = $po === null ? [] : $this->rozjazdStanu($this->stanZastanyBazy, $po);

        parent::tearDown();

        if ($rozjazd !== []) {
            throw new RuntimeException(
                StanZastanejBazyOpis::naglowek($this->stanZastanyBazy, $po)
                .'
  '
                .implode('
  ', $rozjazd)
                .'
Następne testy zastaną odmienny stan i zaczerwienią się bez własnej winy. '
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

    /** @return array<string, int>|null null znaczy „baza nieosiągalna — to inna awaria i ma własny komunikat" */
    private function zmierzStanPoTescie(): ?array
    {
        try {
            return $this->policzWiersze();
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * @param  array<string, int>  $przed
     * @param  array<string, int>  $po
     * @return list<string>
     */
    private function rozjazdStanu(array $przed, array $po): array
    {
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

        // ZEROWY punkt kontrolny — WYŁĄCZNIE pod runnerem równoległym, wcześniej niż
        // wszystko poniżej. Dwa punkty niżej porównują żywe połączenie z deklaracją;
        // ten dodatkowo porównuje nazwę, którą runner ZAMIERZA utworzyć dla tego procesu
        // (`Tests\Concerns\ProcessDatabaseNameGuard`). Rozjazd między konfiguracją a
        // deklaracją kończy proces TWARDO (`exit`, nie `fail`): nieudana asercja kończy
        // tylko bieżący test i PHPUnit jedzie do następnego, a `CREATE DATABASE` pod
        // złą nazwą zdąży się wykonać w międzyczasie. Twardy koniec nie zostawia procesu,
        // który mógłby cokolwiek jeszcze utworzyć.
        if (ParallelTesting::token() !== false) {
            $rozjazdNazwy = ProcessDatabaseNameGuard::ocena();

            if ($rozjazdNazwy !== []) {
                fwrite(STDERR, PHP_EOL.ProcessDatabaseNameGuard::komunikat($rozjazdNazwy).PHP_EOL);
                exit(1);
            }
        }

        if (self::$measuredDatabase === null) {
            self::$measuredDatabase = self::measureDatabase($app);
            self::announceDatabase(self::$measuredDatabase);
        }

        if (! in_array(self::$measuredDatabase, static::allowedDatabases(), true)) {
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
                implode('" albo "', static::allowedDatabases()),
                self::$measuredDatabase,
            ));
        }

        return $app;
    }

    /**
     * DRUGI punkt kontrolny — jedyny haczyk między przełączeniem bazy przez runner
     * równoległy a czyszczeniem jej przez `RefreshDatabase`.
     *
     * Pomiar jest tu ŚWIEŻY (bez pamięci procesu), bo pamięć procesu to dokładnie ta
     * rzecz, którą framework unieważnił w wierszu 103 cyklu życia: baza z chwili
     * `refreshApplication()` już nie jest bazą, którą zaraz wyczyści cecha.
     */
    protected function setUpTraits()
    {
        $zmierzona = self::measureDatabase($this->app);
        $dopuszczone = static::allowedDatabases();

        if (! in_array($zmierzona, $dopuszczone, true)) {
            if (self::$connectionFailure !== null) {
                $this->fail(
                    'PRZERWANE tuż przed `RefreshDatabase`: nie udało się połączyć z bazą, '
                    .'na którą przełączył runner, więc nie wiadomo, co zaraz zostanie wyczyszczone. '
                    .'To NIE jest pułapka P-1 — to awaria połączenia.
Powód: '.self::$connectionFailure,
                );
            }

            $this->fail(sprintf(
                'PRZERWANE tuż przed `RefreshDatabase`: między utworzeniem aplikacji a czyszczeniem '
                .'bazy połączenie stanęło na "%s", a dopuszczone jest wyłącznie "%s". '
                .'Dopuszczenie jest wyprowadzone z deklaracji `phpunit.xml` (nazwa własna oraz jej '
                .'postać per proces `…_test_TOKEN`, którą generuje runner) — nazwa spoza tej rodziny '
                .'znaczy, że `RefreshDatabase` skasowałby za chwilę CUDZĄ bazę.',
                $zmierzona,
                implode('" albo "', $dopuszczone),
            ));
        }

        return parent::setUpTraits();
    }

    /**
     * Nazwa bazy zadeklarowana w `phpunit.xml`.
     *
     * Brak deklaracji albo deklaracja pusta przerywa suitę wyjątkiem — „nie napisano,
     * na czym mamy biec" nie jest zgodą na bieganie na czymkolwiek.
     */
    public static function declaredDatabase(): string
    {
        $sciezka = static::sciezkaDeklaracji();

        return self::$declaredDatabases[$sciezka] ??= DeclaredTestDatabase::fromFile($sciezka);
    }

    /**
     * Plik z deklaracją. Osobna metoda WYŁĄCZNIE po to, żeby świadek przyrządu mógł
     * podstawić deklarację pustą i sprawdzić, że strażnik przerywa (kryterium 3).
     *
     * Celowo NIE jest to zmienna środowiskowa: środowisko jest dokładnie tym, co
     * pułapka P-1 podmienia, więc wskazanie deklaracji zmienną otwierałoby tę pułapkę
     * z drugiej strony. Podmienić może tylko klasa napisana w `tests/` — czyli zmiana,
     * którą widać w przeglądzie kodu.
     */
    protected static function sciezkaDeklaracji(): string
    {
        return dirname(__DIR__).DIRECTORY_SEPARATOR.'phpunit.xml';
    }

    /**
     * Nazwy baz, na których temu przebiegowi wolno biec — deklaracja plus postać
     * per proces, którą runner sam generuje. Wyprowadzenie mieszka w osobnej klasie,
     * żeby dało się je sprawdzić bez uruchamiania suity.
     *
     * @return list<string>
     */
    public static function allowedDatabases(): array
    {
        return AllowedTestDatabases::derive(static::declaredDatabase(), ParallelTesting::token());
    }

    /** Nazwa bazy prosto z silnika — źródłem prawdy jest połączenie, nie plik konfiguracji. */
    private static function measureDatabase(Application $app): string
    {
        try {
            $nazwa = (string) $app->make('db')->connection()->selectOne('select current_database() as name')->name;

            // Udany pomiar kasuje pamięć o poprzedniej awarii — inaczej drugi punkt
            // kontrolny opisywałby dzisiejszy rozjazd wczorajszym zerwanym połączeniem.
            self::$connectionFailure = null;

            return $nazwa;
        } catch (Throwable $exception) {
            self::$connectionFailure = $exception->getMessage();

            return '(brak połączenia)';
        }
    }

    /**
     * Nazwa bazy ma stać w logu KAŻDEGO przebiegu — raport cytuje bazę zmierzoną,
     * nie tę zadeklarowaną w pliku konfiguracji.
     */
    private static function announceDatabase(string $database): void
    {
        fwrite(STDERR, PHP_EOL.'[PRZYRZĄD] baza testowa zmierzona silnikiem: '.$database.PHP_EOL);
    }
}
