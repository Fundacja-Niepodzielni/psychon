<?php

namespace Tests\Feature\Przyrzad;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Facade;
use PHPUnit\Framework\Attributes\Group;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ReflectionClass;
use ReflectionMethod;
use SplFileInfo;
use Tests\TestCase;

/**
 * Świadek sygnatur fasad.
 *
 * KRYTERIUM. Każde wołanie fasady, które wykonuje aplikacja, musi istnieć — z tą
 * sygnaturą — w ZAINSTALOWANEJ wersji pakietu. Fasada nie ma metod: `Facade::__callStatic`
 * przekazuje dalej dowolną nazwę, więc literówka albo metoda usunięta w nowszej wersji
 * frameworka nie jest błędem składni ani ostrzeżeniem — jest wyjątkiem w czasie działania,
 * na tej jednej ścieżce, której nikt nie przeszedł testem.
 *
 * LISTA WOŁAŃ POCHODZI Z KODU, NIE Z PAMIĘCI: skan `app/` i `routes/` tokenizerem PHP
 * (`token_get_all`), mapa aliasów z wierszy `use` tego samego pliku. Wyliczanka „fasady,
 * o których pamiętam" broniłaby wyłącznie tego, co autor zdążył sobie wyobrazić — a chodzi
 * o to wołanie, którego nikt nie wpisał na listę.
 *
 * ŹRÓDŁO SYGNATURY (kolejność; każda pozycja mierzona w vendorze tego klonu):
 *   1. publiczna metoda korzenia fasady (`getFacadeRoot()`) — refleksja;
 *   2. `@method` w docblocku klasy fasady — tak pakiet opisuje metody przekazywane dalej
 *      przez `__call` managera (`DB::table()` nie jest metodą `DatabaseManager`, tylko
 *      przechodzi do połączenia);
 *   3. makro zarejestrowane na korzeniu (`Macroable::hasMacro`).
 * Nazwa nieobecna we wszystkich trzech = czerwień z nazwą miejsca wołania.
 *
 * CZEGO NIE MIERZY: typów argumentów (tylko ich liczbę wobec wymaganych i dopuszczalnych),
 * wołań budowanych dynamicznie (`$fasada::{$nazwa}()`), a przy argumentach nazwanych,
 * rozpakowaniu `...` i pierwszorzędnym callable liczba argumentów jest statycznie
 * nierozstrzygalna — wtedy sprawdzane jest samo istnienie metody.
 *
 * NIE POTRZEBUJE BAZY — potrzebuje podniesionego kontenera, żeby WYPROWADZIĆ korzeń fasady
 * z jej akcesora, zamiast zgadywać klasę. Jako klasa bez cechy bazodanowej trafia regułą
 * `GrupaWspolnejBazyTest` do grupy `wspolna-baza`, czyli do kroku sekwencyjnego bramki.
 *
 * `php artisan test --filter=SygnaturyFasad`
 */
#[Group('wspolna-baza')]
final class SygnaturyFasadTest extends TestCase
{
    /** Katalogi kodu aplikacji objęte skanem. Migracje są zamrożone i mają własnego świadka. */
    private const KORZENIE = ['app', 'routes'];

    public function test_kazde_wolanie_fasady_istnieje_w_zainstalowanej_wersji(): void
    {
        $wolania = $this->wolaniaFasad();

        $this->assertGreaterThan(
            20,
            count($wolania),
            'Skan nie znalazł wołań fasad — kontrola nie ma czego mierzyć, a wyglądałaby na zieloną.',
        );

        $zarzuty = [];

        foreach ($wolania as $wolanie) {
            $zarzut = $this->ocen($wolanie);

            if ($zarzut !== null) {
                $zarzuty[] = $zarzut;
            }
        }

        sort($zarzuty);

        $this->assertSame(
            [],
            $zarzuty,
            "Wołanie fasady nie zgadza się z zainstalowaną wersją pakietu. Fasada przepuszcza\n"
            ."każdą nazwę (`__callStatic`), więc to nie pada przy uruchomieniu, tylko na tej jednej\n"
            ."ścieżce w czasie działania:\n  ".implode("\n  ", $zarzuty),
        );
    }

    public function test_swiadek_widzi_metode_nieistniejaca(): void
    {
        // Kontrola pozytywna: gdyby `ocen()` przestało cokolwiek rozpoznawać (inny format
        // docblocków, zmieniona refleksja), pierwszy test byłby zielony na pustym zbiorze.
        $zarzut = $this->ocen([
            'fasada' => DB::class,
            'metoda' => 'metodaKtorejNieMa',
            'argumentow' => 0,
            'plik' => 'tests/Feature/Przyrzad/SygnaturyFasadTest.php',
            'linia' => __LINE__,
        ]);

        $this->assertNotNull($zarzut, 'Świadek nie widzi metody, której w pakiecie nie ma — nie mierzy niczego.');
        $this->assertStringContainsString('metodaKtorejNieMa', (string) $zarzut);

        // Kontrola odwrotna: metoda, która w pakiecie JEST, nie może być zgłaszana.
        $this->assertNull($this->ocen([
            'fasada' => DB::class,
            'metoda' => 'transaction',
            'argumentow' => 1,
            'plik' => 'tests/Feature/Przyrzad/SygnaturyFasadTest.php',
            'linia' => __LINE__,
        ]));
    }

    /**
     * @param  array{fasada: class-string, metoda: string, argumentow: int|null, plik: string, linia: int}  $wolanie
     */
    private function ocen(array $wolanie): ?string
    {
        $sygnatury = $this->sygnatury($wolanie['fasada'], $wolanie['metoda']);

        $miejsce = sprintf(
            '%s:%d  %s::%s()',
            $wolanie['plik'],
            $wolanie['linia'],
            class_basename($wolanie['fasada']),
            $wolanie['metoda'],
        );

        if ($sygnatury === []) {
            return $miejsce.' — w zainstalowanej wersji ('.$wolanie['fasada'].') nie ma takiej metody: '
                .'ani na korzeniu fasady, ani w `@method`, ani jako makro.';
        }

        if ($wolanie['argumentow'] === null) {
            return null; // liczba argumentów statycznie nierozstrzygalna — mierzone jest istnienie
        }

        foreach ($sygnatury as $sygnatura) {
            if ($this->liczbaPasuje($wolanie['argumentow'], $sygnatura)) {
                return null;
            }
        }

        $opisy = array_map(
            static fn (array $s): string => sprintf(
                '%s [%s] wymaga %d, przyjmuje %s',
                $s['nazwa'],
                $s['zrodlo'],
                $s['wymagane'],
                $s['zmienna'] ? 'dowolnie wiele' : (string) $s['wszystkie'],
            ),
            $sygnatury,
        );

        return $miejsce.' — wołane z '.$wolanie['argumentow'].' arg.; zainstalowana sygnatura: '
            .implode(' | ', $opisy);
    }

    /** @param  array{wymagane: int, wszystkie: int, zmienna: bool}  $sygnatura */
    private function liczbaPasuje(int $argumentow, array $sygnatura): bool
    {
        if ($argumentow < $sygnatura['wymagane']) {
            return false;
        }

        return $sygnatura['zmienna'] || $argumentow <= $sygnatura['wszystkie'];
    }

    /**
     * @param  class-string  $fasada
     * @return list<array{nazwa: string, zrodlo: string, wymagane: int, wszystkie: int, zmienna: bool}>
     */
    private function sygnatury(string $fasada, string $metoda): array
    {
        $sygnatury = [];

        $korzen = $fasada::getFacadeRoot();
        $klasaKorzenia = is_object($korzen) ? get_class($korzen) : null;

        if ($klasaKorzenia !== null && method_exists($klasaKorzenia, $metoda)) {
            $refleksja = new ReflectionMethod($klasaKorzenia, $metoda);

            if ($refleksja->isPublic()) {
                $sygnatury[] = [
                    'nazwa' => $metoda,
                    'zrodlo' => 'korzeń '.$klasaKorzenia,
                    'wymagane' => $refleksja->getNumberOfRequiredParameters(),
                    'wszystkie' => $refleksja->getNumberOfParameters(),
                    'zmienna' => $refleksja->isVariadic(),
                ];
            }
        }

        $zDocblocka = $this->sygnaturyZDocblocka($fasada);

        if (isset($zDocblocka[$metoda])) {
            $sygnatury[] = $zDocblocka[$metoda];
        }

        if ($klasaKorzenia !== null && method_exists($klasaKorzenia, 'hasMacro') && $klasaKorzenia::hasMacro($metoda)) {
            $sygnatury[] = [
                'nazwa' => $metoda,
                'zrodlo' => 'makro na '.$klasaKorzenia,
                'wymagane' => 0,
                'wszystkie' => PHP_INT_MAX,
                'zmienna' => true,
            ];
        }

        return $sygnatury;
    }

    /**
     * `@method` z docblocku klasy fasady — czytane refleksją z klasy ZAINSTALOWANEJ,
     * nie z pliku odszukanego ścieżką.
     *
     * @param  class-string  $fasada
     * @return array<string, array{nazwa: string, zrodlo: string, wymagane: int, wszystkie: int, zmienna: bool}>
     */
    private function sygnaturyZDocblocka(string $fasada): array
    {
        static $pamiec = [];

        if (isset($pamiec[$fasada])) {
            return $pamiec[$fasada];
        }

        $docblock = (new ReflectionClass($fasada))->getDocComment();
        $wynik = [];

        if ($docblock !== false) {
            preg_match_all(
                '/@method\s+(?:static\s+)?(?:[^\s()]+\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)/',
                $docblock,
                $trafienia,
                PREG_SET_ORDER,
            );

            foreach ($trafienia as $trafienie) {
                $parametry = $this->parametryZOpisu($trafienie[2]);

                $wynik[$trafienie[1]] = [
                    'nazwa' => $trafienie[1],
                    'zrodlo' => '@method w '.$fasada,
                    'wymagane' => $parametry['wymagane'],
                    'wszystkie' => $parametry['wszystkie'],
                    'zmienna' => $parametry['zmienna'],
                ];
            }
        }

        return $pamiec[$fasada] = $wynik;
    }

    /** @return array{wymagane: int, wszystkie: int, zmienna: bool} */
    private function parametryZOpisu(string $lista): array
    {
        $lista = trim($lista);

        if ($lista === '') {
            return ['wymagane' => 0, 'wszystkie' => 0, 'zmienna' => false];
        }

        $czesci = [];
        $glebokosc = 0;
        $biezaca = '';

        foreach (str_split($lista) as $znak) {
            if ($znak === ',' && $glebokosc === 0) {
                $czesci[] = $biezaca;
                $biezaca = '';

                continue;
            }

            if (in_array($znak, ['(', '[', '{', '<'], true)) {
                $glebokosc++;
            } elseif (in_array($znak, [')', ']', '}', '>'], true)) {
                $glebokosc--;
            }

            $biezaca .= $znak;
        }

        $czesci[] = $biezaca;

        $wymagane = 0;
        $zmienna = false;

        foreach ($czesci as $czesc) {
            if (str_contains($czesc, '...')) {
                $zmienna = true;

                continue;
            }

            if (! str_contains($czesc, '=')) {
                $wymagane++;
            }
        }

        return ['wymagane' => $wymagane, 'wszystkie' => count($czesci), 'zmienna' => $zmienna];
    }

    /**
     * @return list<array{fasada: class-string, metoda: string, argumentow: int|null, plik: string, linia: int}>
     */
    private function wolaniaFasad(): array
    {
        $wolania = [];

        foreach (self::KORZENIE as $katalog) {
            $korzen = base_path($katalog);

            if (! is_dir($korzen)) {
                continue;
            }

            /** @var SplFileInfo $plik */
            foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($korzen)) as $plik) {
                if (! $plik->isFile() || $plik->getExtension() !== 'php') {
                    continue;
                }

                $wzgledny = $katalog.'/'.str_replace('\\', '/', substr($plik->getPathname(), strlen($korzen) + 1));

                foreach ($this->wolaniaWPliku((string) file_get_contents($plik->getPathname()), $wzgledny) as $wolanie) {
                    $wolania[] = $wolanie;
                }
            }
        }

        return $wolania;
    }

    /**
     * @return list<array{fasada: class-string, metoda: string, argumentow: int|null, plik: string, linia: int}>
     */
    private function wolaniaWPliku(string $kod, string $plik): array
    {
        $tokeny = array_values(array_filter(
            token_get_all($kod),
            static fn ($token): bool => ! is_array($token)
                || ! in_array($token[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true),
        ));

        $aliasy = $this->aliasy($tokeny);
        $wolania = [];
        $ile = count($tokeny);

        for ($i = 0; $i < $ile - 3; $i++) {
            $nazwa = $tokeny[$i];

            if (! is_array($nazwa) || ! in_array($nazwa[0], [T_STRING, T_NAME_QUALIFIED, T_NAME_FULLY_QUALIFIED], true)) {
                continue;
            }

            if (! is_array($tokeny[$i + 1]) || $tokeny[$i + 1][0] !== T_DOUBLE_COLON) {
                continue;
            }

            $metoda = $tokeny[$i + 2];

            if (! is_array($metoda) || $metoda[0] !== T_STRING || $tokeny[$i + 3] !== '(') {
                continue;
            }

            $fasada = $this->rozwin($nazwa[1], $aliasy);

            if ($fasada === null || ! is_subclass_of($fasada, Facade::class)) {
                continue;
            }

            $wolania[] = [
                'fasada' => $fasada,
                'metoda' => $metoda[1],
                'argumentow' => $this->policzArgumenty($tokeny, $i + 3),
                'plik' => $plik,
                'linia' => $nazwa[2],
            ];
        }

        return $wolania;
    }

    /**
     * Liczba argumentów wołania albo `null`, gdy statycznie nierozstrzygalna
     * (argument nazwany, rozpakowanie `...`, pierwszorzędny callable `(...)`).
     *
     * PRZECINEK KOŃCOWY jest tu policzony osobno, bo pierwsza wersja licząca „przecinki
     * plus jeden" zgłosiła FAŁSZYWĄ czerwień na `Password::reset(…, …,)` — dwuargumentowe
     * wołanie ze stylowym przecinkiem po ostatnim argumencie. Przyrząd, który myli styl
     * z błędem, kosztuje dokładnie tyle, ile błąd, którego szuka.
     *
     * @param  list<array{0: int, 1: string, 2: int}|string>  $tokeny
     */
    private function policzArgumenty(array $tokeny, int $nawias): ?int
    {
        $glebokosc = 0;
        $przecinki = 0;
        $pusty = true;
        $przecinekKoncowy = false;
        $ile = count($tokeny);

        for ($i = $nawias; $i < $ile; $i++) {
            $token = $tokeny[$i];

            if (is_array($token)) {
                if ($token[0] === T_ELLIPSIS) {
                    return null;
                }

                if ($glebokosc === 1 && $token[0] === T_STRING && ($tokeny[$i + 1] ?? null) === ':') {
                    return null; // argument nazwany
                }

                $pusty = false;
                $przecinekKoncowy = false;

                continue;
            }

            if (in_array($token, ['(', '[', '{'], true)) {
                $glebokosc++;

                if ($glebokosc > 1) {
                    $pusty = false;
                    $przecinekKoncowy = false;
                }

                continue;
            }

            if (in_array($token, [')', ']', '}'], true)) {
                $glebokosc--;

                if ($glebokosc === 0) {
                    return $pusty ? 0 : $przecinki + ($przecinekKoncowy ? 0 : 1);
                }

                $przecinekKoncowy = false;

                continue;
            }

            $pusty = false;

            if ($token === ',' && $glebokosc === 1) {
                $przecinki++;
                $przecinekKoncowy = true;
            } else {
                $przecinekKoncowy = false;
            }
        }

        return null;
    }

    /**
     * @param  list<array{0: int, 1: string, 2: int}|string>  $tokeny
     * @return array<string, string>
     */
    private function aliasy(array $tokeny): array
    {
        $aliasy = [];
        $ile = count($tokeny);

        for ($i = 0; $i < $ile; $i++) {
            $token = $tokeny[$i];

            if (! is_array($token) || $token[0] !== T_USE) {
                continue;
            }

            $sciezka = '';
            $alias = '';
            $poAs = false;

            for ($j = $i + 1; $j < $ile; $j++) {
                $kolejny = $tokeny[$j];

                if ($kolejny === ';' || $kolejny === '{' || $kolejny === '(') {
                    break;
                }

                if (is_array($kolejny) && $kolejny[0] === T_AS) {
                    $poAs = true;

                    continue;
                }

                if (is_array($kolejny) && in_array($kolejny[0], [T_STRING, T_NAME_QUALIFIED, T_NAME_FULLY_QUALIFIED], true)) {
                    if ($poAs) {
                        $alias = $kolejny[1];
                    } else {
                        $sciezka .= $kolejny[1];
                    }
                }
            }

            if ($sciezka === '') {
                continue;
            }

            $sciezka = ltrim($sciezka, '\\');
            $czlony = explode('\\', $sciezka);
            $aliasy[$alias !== '' ? $alias : end($czlony)] = $sciezka;
        }

        return $aliasy;
    }

    /** @param  array<string, string>  $aliasy */
    private function rozwin(string $nazwa, array $aliasy): ?string
    {
        $nazwa = ltrim($nazwa, '\\');

        if (isset($aliasy[$nazwa])) {
            $nazwa = $aliasy[$nazwa];
        }

        return class_exists($nazwa) ? $nazwa : null;
    }
}
