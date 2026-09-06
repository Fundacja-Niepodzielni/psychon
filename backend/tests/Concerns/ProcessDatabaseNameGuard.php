<?php

namespace Tests\Concerns;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\ParallelTesting;
use Tests\TestCase;
use Throwable;

/**
 * Kontrola TRZECH wartości NA STARCIE PROCESU pod runnerem równoległym — zanim
 * powstanie choćby jedna baza testowa dla tego tokena.
 *
 * Runner nadaje bazie procesu nazwę na podstawie KONFIGURACJI połączenia
 * (`DB::getConfig('database')`, czytane w jego własnym wywołaniu tworzącym —
 * `Illuminate/Testing/Concerns/TestDatabases.php`, `whenNotUsingInMemoryDatabase()`
 * + `testDatabase()`) i tą nazwą woła `CREATE DATABASE`. Kontrola, która zamiast tego
 * mierzy wyłącznie ŻYWE POŁĄCZENIE (`select current_database()`) PO fakcie, może
 * mierzyć poprawnie i mimo to nie zapobiec niczemu: połączenie i konfiguracja to
 * dwa OSOBNE źródła, a rozjazd między nimi objawia się dokładnie tam, gdzie żadne
 * z osobna go nie widzi.
 *
 * Poprzednia kontrola siedziała też PO STRONIE POJEDYNCZEGO TESTU: zgłaszała
 * niezgodność jako nieudany test, a PHPUnit — zgodnie ze swoją naturą — przechodził
 * do kolejnego testu zamiast zatrzymać proces. Baza pod błędną nazwą powstawała raz,
 * a zgłoszenie powtarzało się przy każdym kolejnym teście w tym samym procesie.
 *
 * Ta kontrola stoi WYŻEJ: na starcie procesu, zanim runner zdąży cokolwiek utworzyć.
 * Porównuje trzy niezależnie odczytane wartości względem tej samej, jedynej
 * deklaracji (`Tests\Concerns\AllowedTestDatabases`):
 *   1. deklarację z pliku konfiguracji suity,
 *   2. nazwę, jaką NAPRAWDĘ ma żywe połączenie w tej chwili,
 *   3. nazwę, którą runner ZAMIERZA nadać bazie tego procesu — wyliczoną dokładnie
 *      tak samo jak liczy ją sam runner (korzeń z `DB::getConfig('database')` plus
 *      przyrostek tokena).
 * Rozjazd między którąkolwiek parą kończy proces, zanim jakikolwiek test zdążył
 * się wykonać i zanim runner zdążył utworzyć bazę pod nazwą, której nikt nie widzi
 * z obu stron naraz.
 */
final class ProcessDatabaseNameGuard
{
    /** Przyrostek runnera — ten sam cytat źródła co w `AllowedTestDatabases`. */
    private const PRZYROSTEK_TOKENA = '_test_';

    /**
     * @return list<string> opisy rozjazdu; pusta lista znaczy „wszystkie trzy się zgadzają"
     */
    public static function ocena(): array
    {
        $token = ParallelTesting::token();
        $zadeklarowana = TestCase::declaredDatabase();
        $dopuszczone = AllowedTestDatabases::derive($zadeklarowana, $token);

        $korzenKonfiguracji = trim((string) DB::getConfig('database'));
        $doUtworzenia = self::zNazwaProcesu($korzenKonfiguracji, $token);

        $zywePolaczenie = self::zmierzZywePolaczenie();

        $bledy = [];

        if (! in_array($doUtworzenia, $dopuszczone, true)) {
            $bledy[] = sprintf(
                'nazwa, którą runner zamierza UTWORZYĆ dla tego procesu ("%s", z konfiguracji "%s"), '
                .'nie należy do rodziny deklaracji ("%s")',
                $doUtworzenia,
                $korzenKonfiguracji,
                implode('" / "', $dopuszczone),
            );
        }

        if ($zywePolaczenie !== null && ! in_array($zywePolaczenie, $dopuszczone, true)) {
            $bledy[] = sprintf(
                'żywe połączenie stoi na "%s", spoza rodziny deklaracji ("%s")',
                $zywePolaczenie,
                implode('" / "', $dopuszczone),
            );
        }

        return $bledy;
    }

    /** Ten sam wzór co `Illuminate\Testing\Concerns\TestDatabases::testDatabase()`. */
    private static function zNazwaProcesu(string $korzen, string|int|false|null $token): string
    {
        $token = ($token === false || $token === null) ? '' : trim((string) $token);

        return $token === '' ? $korzen : $korzen.self::PRZYROSTEK_TOKENA.$token;
    }

    private static function zmierzZywePolaczenie(): ?string
    {
        try {
            return (string) DB::selectOne('select current_database() as name')->name;
        } catch (Throwable) {
            return null;
        }
    }

    /** Treść komunikatu, wspólna dla obu miejsc, w których ta kontrola się odzywa. */
    public static function komunikat(array $bledy): string
    {
        return 'PRZERWANE na starcie procesu: '.implode('; ', $bledy).'. Zatrzymuję PRZED utworzeniem '
            .'jakiejkolwiek bazy testowej dla tego procesu — złej nazwy nie da się odwołać po `CREATE DATABASE`.';
    }
}
