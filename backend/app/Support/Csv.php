<?php

namespace App\Support;

use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The shared CSV export helper (API contract §1): UTF-8 BOM + `;` separator,
 * so files open correctly in Polish Excel. FROZEN SIGNATURE.
 */
final class Csv
{
    private const string BOM = "\xEF\xBB\xBF";

    private const string SEPARATOR = ';';

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
                    static fn ($value): string => (string) $value,
                    array_values((array) $row),
                ), self::SEPARATOR, '"', '');
            }

            fclose($out);
        }, $name, [
            'Content-Type' => 'text/csv; charset=utf-8',
        ]);
    }
}
