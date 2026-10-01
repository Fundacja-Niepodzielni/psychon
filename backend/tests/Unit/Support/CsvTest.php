<?php

namespace Tests\Unit\Support;

use App\Support\Csv;
use Illuminate\Foundation\Testing\TestCase;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Wspólny helper eksportu CSV: komórka tekstowa, którą arkusz mógłby odczytać
 * jako formułę (pierwszy znak `=`, `+`, `-`, `@`, tabulator albo powrót
 * karetki), dostaje apostrof z przodu; liczby natywne (`int`, `float`) wychodzą
 * bez zmian. Wszystkie asercje są na surowych bajtach pliku, nie na odczycie
 * przez parser CSV — parser sam zdejmuje cudzysłowy i ukryłby błąd.
 *
 * Nie otwiera bazy: rozszerza klasę bazową frameworka, nie `Tests\TestCase`.
 */
class CsvTest extends TestCase
{
    private const string BOM = "\xEF\xBB\xBF";

    #[DataProvider('formulaTriggers')]
    public function test_text_cell_starting_with_a_formula_trigger_gets_an_apostrophe(string $value, string $expected): void
    {
        $this->assertSame(self::BOM.$expected."\n", $this->render([[$value]]));
    }

    /** @return array<string, array{string, string}> */
    public static function formulaTriggers(): array
    {
        return [
            'equals sign' => ['=1+1', "'=1+1"],
            'plus sign' => ['+48600100200', "'+48600100200"],
            'minus sign' => ['-cmd', "'-cmd"],
            'at sign' => ['@SUM(1)', "'@SUM(1)"],
            'tab' => ["\tcmd", "\"'\tcmd\""],
            'carriage return' => ["\rcmd", "\"'\rcmd\""],
        ];
    }

    public function test_quotes_inside_a_value_are_doubled(): void
    {
        $this->assertSame(
            self::BOM."\"say \"\"hi\"\"\"\n",
            $this->render([['say "hi"']]),
        );
    }

    public function test_neutralised_value_with_quotes_keeps_them_doubled(): void
    {
        $this->assertSame(
            self::BOM."\"'=HYPERLINK(\"\"x\"\")\"\n",
            $this->render([['=HYPERLINK("x")']]),
        );
    }

    public function test_value_with_the_separator_is_enclosed(): void
    {
        $this->assertSame(self::BOM."\"a;b\"\n", $this->render([['a;b']]));
        $this->assertSame(self::BOM."\"'=a;b\"\n", $this->render([['=a;b']]));
    }

    public function test_native_numbers_are_written_as_they_are(): void
    {
        $this->assertSame(
            self::BOM."-5;-1.5;0;42;0.25\n",
            $this->render([[-5, -1.5, 0, 42, 0.25]]),
        );
    }

    public function test_text_that_only_looks_like_a_negative_number_is_still_text(): void
    {
        $this->assertSame(self::BOM."'-5;'-1.5\n", $this->render([['-5', '-1.5']]));
    }

    public function test_empty_string_and_null_stay_empty(): void
    {
        $this->assertSame(self::BOM.";;x\n", $this->render([['', null, 'x']]));
    }

    public function test_triggers_inside_a_value_are_left_alone(): void
    {
        $this->assertSame(
            self::BOM."a=b;x+y;x-y;name@example.test;2026-10-01T10:00:00Z\n",
            $this->render([['a=b', 'x+y', 'x-y', 'name@example.test', '2026-10-01T10:00:00Z']]),
        );
    }

    public function test_every_row_of_a_stream_is_neutralised_and_the_header_is_kept(): void
    {
        $rows = (static function (): iterable {
            yield ['id', 'name'];
            yield [1, '=cmd'];
            yield 'k' => [2, '@cmd'];
        })();

        $this->assertSame(
            self::BOM."id;name\n1;'=cmd\n2;'@cmd\n",
            $this->render($rows),
        );
    }

    public function test_keyed_row_is_written_by_position(): void
    {
        $this->assertSame(
            self::BOM."1;'=cmd\n",
            $this->render([['id' => 1, 'name' => '=cmd']]),
        );
    }

    public function test_bom_separator_and_content_type_are_unchanged(): void
    {
        $response = Csv::download('x.csv', [['a', 'b']]);

        $this->assertSame('text/csv; charset=utf-8', $response->headers->get('Content-Type'));
        $this->assertSame(self::BOM."a;b\n", $this->render([['a', 'b']]));
    }

    /**
     * @param  iterable<int|string, array<int|string, mixed>>  $rows
     */
    private function render(iterable $rows): string
    {
        $response = Csv::download('x.csv', $rows);

        ob_start();
        $response->sendContent();

        return (string) ob_get_clean();
    }
}
