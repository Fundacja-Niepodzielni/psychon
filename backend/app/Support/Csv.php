<?php

namespace App\Support;

use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The shared CSV export helper (API contract §1): UTF-8 BOM + `;` separator,
 * so files open correctly in Polish Excel. FROZEN SIGNATURE.
 *
 * Every text cell that a spreadsheet could read as a formula is neutralised
 * here, in the one place that writes CSV: a cell whose first character is
 * `=`, `+`, `-`, `@`, a tab or a carriage return gets an apostrophe in front
 * of it, so it opens as plain text. Names, e-mail addresses and audit
 * details come from people, and the file is opened by the administration in
 * a spreadsheet. Native numbers (`int`, `float`) are written as they are —
 * a negative number is a number, not a formula.
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
     * value is turned into text and, when it starts with a formula trigger,
     * prefixed with an apostrophe.
     */
    private static function cell(mixed $value): string
    {
        $text = (string) $value;

        if (is_int($value) || is_float($value)) {
            return $text;
        }

        if ($text !== '' && str_contains(self::FORMULA_TRIGGERS, $text[0])) {
            return "'".$text;
        }

        return $text;
    }
}
