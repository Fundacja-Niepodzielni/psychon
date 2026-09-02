<?php

namespace Tests\Unit\Przyrzad;

use PHPUnit\Framework\TestCase;
use RuntimeException;
use Tests\Concerns\DeclaredTestDatabase;

/**
 * Świadek odczytu DEKLARACJI bazy testowej (rdzeń §8.5 pkt 1, `ZLECENIE-014` §3).
 *
 * Trzy przypadki, których nie da się zobaczyć w normalnym przebiegu, bo tam
 * `phpunit.xml` jest zawsze poprawny: brak wpisu, wpis pusty i XML nie do odczytu.
 * Gdyby ich nie sprawdzić, „pusta deklaracja przerywa" byłoby obietnicą, a nie regułą.
 *
 * `php artisan test --filter=DeclaredTestDatabase`
 */
final class DeclaredTestDatabaseTest extends TestCase
{
    public function test_reads_the_declared_database_from_the_configuration_file(): void
    {
        $this->assertSame(
            'niepodzielni_testing',
            DeclaredTestDatabase::fromXml($this->xmlZWpisem('niepodzielni_testing')),
        );
    }

    public function test_a_missing_declaration_aborts_instead_of_allowing_anything(): void
    {
        // „Nie napisano, na czym mamy biec" NIE znaczy „wolno biec na czymkolwiek".
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessageMatches('/nie deklaruje/');

        DeclaredTestDatabase::fromXml('<?xml version="1.0"?><phpunit><php></php></phpunit>');
    }

    public function test_an_empty_declaration_aborts(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessageMatches('/pust/');

        DeclaredTestDatabase::fromXml($this->xmlZWpisem(''));
    }

    public function test_whitespace_only_declaration_counts_as_empty(): void
    {
        // Wariant spoza pokazanego przypadku: spacja wygląda jak wartość i nie jest nią.
        $this->expectException(RuntimeException::class);

        DeclaredTestDatabase::fromXml($this->xmlZWpisem('   '));
    }

    public function test_unreadable_configuration_aborts(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessageMatches('/Nie da się odczytać/');

        DeclaredTestDatabase::fromXml('to nie jest xml <<<');
    }

    public function test_a_missing_file_aborts(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessageMatches('/Brak pliku/');

        DeclaredTestDatabase::fromFile('/nie/ma/takiego/phpunit.xml');
    }

    private function xmlZWpisem(string $wartosc): string
    {
        return '<?xml version="1.0"?><phpunit><php>'
            .'<env name="APP_ENV" value="testing" force="true"/>'
            .'<env name="DB_DATABASE" value="'.$wartosc.'" force="true"/>'
            .'</php></phpunit>';
    }
}
