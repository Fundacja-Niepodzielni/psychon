<?php

namespace Tests\Unit\Support;

use App\Support\Csv;
use Illuminate\Foundation\Testing\TestCase;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Wspólny helper eksportu CSV: komórka tekstowa, którą arkusz mógłby odczytać
 * jako formułę (pierwszy znak `=`, `+`, `-`, `@`, tabulator albo powrót
 * karetki), dostaje apostrof z przodu; liczby natywne (`int`, `float`) wychodzą
 * bez zmian. Apostrof dostaje też miejsce tuż po znaku `,`, powrocie karetki,
 * nowej linii albo tabulatorze (po ewentualnych białych znakach), jeśli dalej
 * stoi `=`, `+`, `-` albo `@` — arkusz czytający plik z separatorem `,` albo
 * łamiący rekord na nowej linii zaczyna tam nową komórkę. Napis będący samą
 * liczbą ujemną (`-12.50`, `-12,50`, `-7`) wychodzi bez apostrofu. Wszystkie
 * asercje są na surowych bajtach pliku, nie na odczycie przez parser CSV —
 * parser sam zdejmuje cudzysłowy i ukryłby błąd.
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

    #[DataProvider('formulaStartsAfterABreak')]
    public function test_formula_after_a_break_inside_a_cell_gets_an_apostrophe_in_the_cell(string $value, string $expected): void
    {
        $this->assertSame(self::BOM.$expected."\n", $this->render([[$value]]));
    }

    /** @return array<string, array{string, string}> */
    public static function formulaStartsAfterABreak(): array
    {
        return [
            'equals after a comma' => ['x,=HYPERLINK(A1)', "x,'=HYPERLINK(A1)"],
            'plus after a comma' => ['a,+1', "a,'+1"],
            'minus after a comma' => ['a,-1', "a,'-1"],
            'at sign after a comma' => ['a,@SUM(1)', "a,'@SUM(1)"],
            'equals after a line feed' => ["Jan\n=1+1,", "\"Jan\n'=1+1,\""],
            'equals after a carriage return' => ["a\r=1", "\"a\r'=1\""],
            'equals after a tab' => ["a\t=1", "\"a\t'=1\""],
            'equals after a comma and spaces' => ['a,  =1', "\"a,'  =1\""],
            'equals after a comma and a tab' => ["a,\t=1", "\"a,'\t'=1\""],
            'equals after a comma and a line feed' => ["a,\n =1", "\"a,'\n' =1\""],
            'equals after a comma and a carriage return with a line feed' => ["a,\r\n=1", "\"a,'\r'\n'=1\""],
            'line feed at the very start of the cell' => ["\n=1+1", "\"\n'=1+1\""],
            'line feed at the very start before a minus' => ["\n-cmd", "\"\n'-cmd\""],
            'carriage return with line feed at the very start' => ["\r\n=1+1", "\"'\r'\n'=1+1\""],
            'tab at the very start and a formula behind it' => ["\t=1", "\"'\t'=1\""],
            'trigger at the start and again after a comma' => ['=a,=b', "'=a,'=b"],
            'formula after the second of two commas' => ['a,,=1', "a,,'=1"],
            'comma at the very start' => [',=1', ",'=1"],
            'negative number after a comma in a list' => ['[1,-2]', "[1,'-2]"],
            'multi-byte text before the comma' => ['Żółć,=1', "Żółć,'=1"],
            'quotes in the value stay doubled' => ['x,=HYPERLINK("x")', "\"x,'=HYPERLINK(\"\"x\"\")\""],
        ];
    }

    #[DataProvider('textWithoutAFormulaAfterABreak')]
    public function test_text_without_a_formula_after_a_break_is_left_alone(string $value, string $expected): void
    {
        $this->assertSame(self::BOM.$expected."\n", $this->render([[$value]]));
    }

    /** @return array<string, array{string, string}> */
    public static function textWithoutAFormulaAfterABreak(): array
    {
        return [
            'comma then a letter' => ['a,b', 'a,b'],
            'comma then a digit' => ['a,1', 'a,1'],
            'comma then a space then a letter' => ['a, b', '"a, b"'],
            'equals that does not follow a break' => ['a,b=c', 'a,b=c'],
            'minus between spaces' => ['a - b', '"a - b"'],
            'line feed between two words' => ["Jan\nKowalski", "\"Jan\nKowalski\""],
            'line feed at the very start before a letter' => ["\nhello", "\"\nhello\""],
            'e-mail address' => ['name@example.test', 'name@example.test'],
            'date and time' => ['2026-10-01T10:00:00Z', '2026-10-01T10:00:00Z'],
        ];
    }

    #[DataProvider('negativeNumbersWrittenAsText')]
    public function test_text_that_is_only_a_negative_number_has_no_apostrophe(string $value): void
    {
        $this->assertSame(self::BOM.$value."\n", $this->render([[$value]]));
    }

    /** @return array<string, array{string}> */
    public static function negativeNumbersWrittenAsText(): array
    {
        return [
            'decimal with a point' => ['-12.50'],
            'decimal with a comma' => ['-12,50'],
            'integer' => ['-7'],
            'zero' => ['-0'],
            'fraction below one' => ['-0.5'],
            'large decimal' => ['-1234567.891'],
        ];
    }

    #[DataProvider('negativeLookingTextThatIsNotANumber')]
    public function test_text_that_only_starts_like_a_negative_number_still_gets_an_apostrophe(string $value, string $expected): void
    {
        $this->assertSame(self::BOM.$expected."\n", $this->render([[$value]]));
    }

    /** @return array<string, array{string, string}> */
    public static function negativeLookingTextThatIsNotANumber(): array
    {
        return [
            'arithmetic' => ['-1+1', "'-1+1"],
            'cell reference' => ['-A1', "'-A1"],
            'number followed by a formula' => ['-12.50;=X', "\"'-12.50;=X\""],
            'number followed by a comma and a formula' => ['-12,50,=X', "'-12,50,'=X"],
            'minus alone' => ['-', "'-"],
            'no digits before the point' => ['-.5', "'-.5"],
            'no digits after the point' => ['-12.', "'-12."],
            'two decimal separators' => ['-12.50.3', "'-12.50.3"],
            'two minus signs' => ['--5', "'--5"],
            'space after the minus' => ['- 12', "\"'- 12\""],
            'exponent' => ['-1e5', "'-1e5"],
            'trailing line feed' => ["-12\n", "\"'-12\n\""],
        ];
    }

    #[DataProvider('textStartingWithAPlus')]
    public function test_text_starting_with_a_plus_always_gets_an_apostrophe(string $value, string $expected): void
    {
        $this->assertSame(self::BOM.$expected."\n", $this->render([[$value]]));
    }

    /** @return array<string, array{string, string}> */
    public static function textStartingWithAPlus(): array
    {
        return [
            'phone number with spaces' => ['+48 600 100 200', "\"'+48 600 100 200\""],
            'phone number without spaces' => ['+48600100200', "'+48600100200"],
            'positive integer' => ['+12', "'+12"],
            'positive decimal' => ['+12.50', "'+12.50"],
            'plus alone' => ['+', "'+"],
        ];
    }

    public function test_every_cell_of_a_row_is_judged_on_its_own(): void
    {
        $this->assertSame(
            self::BOM."x,'=1;-12.50;'+48;-5\n",
            $this->render([['x,=1', '-12.50', '+48', -5]]),
        );
    }

    public function test_a_long_run_of_white_space_is_handled_in_one_pass(): void
    {
        $value = str_repeat("\t", 50000).'x';

        $this->assertSame(self::BOM."\"'".$value."\"\n", $this->render([[$value]]));
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
