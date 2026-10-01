<?php

namespace App\Support;

use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The shared CSV export helper (API contract §1): UTF-8 BOM + `;` separator,
 * so files open correctly in Polish Excel. FROZEN SIGNATURE.
 *
 * Every text cell that a spreadsheet could read as a formula is neutralised
 * here, in the one place that writes CSV. Names, e-mail addresses and audit
 * details come from people, and the file is opened by the administration in
 * a spreadsheet:
 *
 * - a cell whose first character is `=`, `+`, `-`, `@`, a tab or a carriage
 *   return gets an apostrophe in front of it, so it opens as plain text;
 * - a spreadsheet that reads the file with `,` as the separator, or breaks
 *   a record at a line break inside a field, starts a new cell after every
 *   `,`, carriage return, line feed and tab. So when `=`, `+`, `-` or `@`
 *   follows one of them (after any white space), the apostrophe goes right
 *   after that character — inside the cell, where the new cell will begin;
 * - text that is nothing but a negative number (`-12.50`, `-12,50`, `-7`)
 *   is left as it is: it cannot be a formula, and an apostrophe would show
 *   in the sheet. Text starting with `+` always gets the apostrophe, also a
 *   phone number such as `+48 600 100 200`;
 * - native numbers (`int`, `float`) are written as they are — a negative
 *   number is a number, not a formula.
 */
final class Csv
{
    private const string BOM = "\xEF\xBB\xBF";

    private const string SEPARATOR = ';';

    /**
     * First characters after which a spreadsheet treats a cell as a formula.
     */
    private const string FORMULA_TRIGGERS = "=+-@\t\r";

    /**
     * Characters that start a formula when they open a new cell, i.e. right
     * after a break character (see BREAKS).
     */
    private const string FORMULA_STARTS = '=+-@';

    /**
     * Characters after which a spreadsheet may start a new cell: a `,` used
     * as the separator, a line break, and a tab.
     */
    private const string BREAKS = ",\r\n\t";

    /**
     * Text that is a negative number and nothing else: a minus sign, digits,
     * and at most one decimal separator (`.` or `,`) with digits after it.
     * `\z`, not `$`, so that a trailing line break does not pass.
     */
    private const string NEGATIVE_NUMBER = '/\A-\d+(?:[.,]\d+)?\z/';

    /**
     * Streamed download response. $rows — an iterable of arrays; pass the
     * header row as the first element.
     *
     * @param  iterable<int|string, array<int|string, mixed>>  $rows
     */
    public static function download(string $name, iterable $rows): StreamedResponse
    {
        return response()->streamDownload(function () use ($rows): void {
            $out = fopen('php://output', 'w');
            fwrite($out, self::BOM);

            foreach ($rows as $row) {
                fputcsv($out, array_map(
                    static fn ($value): string => self::cell($value),
                    array_values((array) $row),
                ), self::SEPARATOR, '"', '');
            }

            fclose($out);
        }, $name, [
            'Content-Type' => 'text/csv; charset=utf-8',
        ]);
    }

    /**
     * One cell as text. A native number is returned untouched; any other
     * value is turned into text, gets an apostrophe after every break
     * character that is followed by a formula start, and — when it starts
     * with a formula trigger — an apostrophe in front. Text that is only a
     * negative number is the one exception and is returned as it is.
     */
    private static function cell(mixed $value): string
    {
        $text = (string) $value;

        if (is_int($value) || is_float($value) || $text === '') {
            return $text;
        }

        if (preg_match(self::NEGATIVE_NUMBER, $text) === 1) {
            return $text;
        }

        $text = self::guardCellsStartedByBreaks($text);

        if (str_contains(self::FORMULA_TRIGGERS, $text[0])) {
            return "'".$text;
        }

        return $text;
    }

    /**
     * Puts an apostrophe after every break character (`,`, carriage return,
     * line feed, tab) when the next character that is not white space is a
     * formula start. The text is read from the end, so each byte is looked
     * at once: a pattern with a look-ahead over white space would be slow on
     * a long run of tabs. Only ASCII characters matter here, and they never
     * occur inside a multi-byte UTF-8 sequence, so reading bytes is safe.
     */
    private static function guardCellsStartedByBreaks(string $text): string
    {
        $pieces = [];
        $formulaFollows = false;

        for ($i = strlen($text) - 1; $i >= 0; $i--) {
            $char = $text[$i];

            if ($formulaFollows && str_contains(self::BREAKS, $char)) {
                $pieces[] = "'";
            }

            $pieces[] = $char;

            if (! ctype_space($char)) {
                $formulaFollows = str_contains(self::FORMULA_STARTS, $char);
            }
        }

        return implode('', array_reverse($pieces));
    }
}
