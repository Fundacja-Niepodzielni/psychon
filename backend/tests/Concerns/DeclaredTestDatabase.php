<?php

namespace Tests\Concerns;

use RuntimeException;

/**
 * Nazwa bazy, na której suita DEKLARUJE, że biegnie — czytana z `phpunit.xml`.
 *
 * Dlaczego z PLIKU, a nie z `config('database.…')`: konfiguracja Laravela czyta
 * ŚRODOWISKO, czyli dokładnie to, co pułapka `P-1` podmienia. Strażnik porównujący
 * `config()` z `current_database()` porównywałby wartość nadpisaną z wartością
 * nadpisaną i był zielony właśnie wtedy, gdy powinien krzyczeć.
 *
 * Dlaczego nie stała w kodzie strażnika: byłaby DRUGIM źródłem prawdy obok
 * `phpunit.xml`. Dwa źródła prawdy o tej samej rzeczy rozjeżdżają się w dniu,
 * w którym ktoś zmieni jedno z nich — a strażnik ma pilnować deklaracji, nie
 * własnej pamięci o niej.
 *
 * Pusta albo brakująca deklaracja jest BŁĘDEM, nie zgodą: „nie napisano, na czym
 * mamy biec" nie znaczy „wolno biec na czymkolwiek".
 *
 * Świadek: `tests/Unit/Przyrzad/DeclaredTestDatabaseTest.php`.
 */
final class DeclaredTestDatabase
{
    /**
     * @param  string  $xml  treść `phpunit.xml`
     *
     * @throws RuntimeException gdy deklaracji nie ma, jest pusta albo pliku nie da się przeczytać
     */
    public static function fromXml(string $xml): string
    {
        $poprzedni = libxml_use_internal_errors(true);
        $drzewo = simplexml_load_string($xml);
        libxml_use_internal_errors($poprzedni);

        if ($drzewo === false) {
            throw new RuntimeException(
                'Nie da się odczytać `phpunit.xml`, więc nie wiadomo, na jakiej bazie suita ma biec. '
                .'Przerywam — to nie jest stan, w którym wolno cokolwiek mierzyć.',
            );
        }

        $wpisy = $drzewo->xpath('//php/env[@name="DB_DATABASE"]') ?: [];

        if ($wpisy === []) {
            throw new RuntimeException(
                '`phpunit.xml` nie deklaruje `DB_DATABASE`. Brak deklaracji NIE jest zgodą na '
                .'dowolną bazę — bez niej suita pojechałaby po tym, co akurat stoi w środowisku.',
            );
        }

        $wartosc = trim((string) $wpisy[0]['value']);

        if ($wartosc === '') {
            throw new RuntimeException(
                '`phpunit.xml` deklaruje `DB_DATABASE` jako pustą wartość. Pusta deklaracja '
                .'jest błędem, nie zgodą.',
            );
        }

        return $wartosc;
    }

    /** @throws RuntimeException */
    public static function fromFile(string $sciezka): string
    {
        if (! is_file($sciezka) || ($tresc = @file_get_contents($sciezka)) === false) {
            throw new RuntimeException(
                'Brak pliku `phpunit.xml` pod ścieżką '.$sciezka.' — nie ma czego porównać z silnikiem.',
            );
        }

        return self::fromXml($tresc);
    }
}
