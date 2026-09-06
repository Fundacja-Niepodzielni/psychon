<?php

namespace Database\Seeders;

use App\Models\Material;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * H05 · puts real bytes behind the material rows DemoSeeder creates, so the
 * signed download returns a file instead of a 404.
 *
 * Creates NO database rows on purpose — docs/hackathon/04-seed-demo.md is the
 * binding source for the demo numbers and SeedIntegrityTest guards them.
 */
class CoursesPackageSeeder extends Seeder
{
    public function run(): void
    {
        $disk = Storage::disk('local');

        Material::query()->each(function (Material $material) use ($disk): void {
            if ($disk->exists($material->file_path)) {
                return;
            }

            $disk->put($material->file_path, $this->placeholderPdf($material->name));
        });
    }

    /**
     * A minimal single-page PDF real readers open. Built by hand rather than
     * shipped as a binary fixture: the xref offsets have to be computed from
     * the final byte layout, and a stored blob would drift on any edit.
     */
    private function placeholderPdf(string $name): string
    {
        $objects = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] '
                .'/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
            $this->contentStream($name),
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
        ];

        $pdf = "%PDF-1.4\n";
        $offsets = [];

        foreach ($objects as $index => $body) {
            $offsets[] = strlen($pdf);
            $pdf .= sprintf("%d 0 obj\n%s\nendobj\n", $index + 1, $body);
        }

        $xrefOffset = strlen($pdf);
        $pdf .= sprintf("xref\n0 %d\n0000000000 65535 f \n", count($objects) + 1);

        foreach ($offsets as $offset) {
            $pdf .= sprintf("%010d 00000 n \n", $offset);
        }

        $pdf .= sprintf(
            "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n",
            count($objects) + 1,
            $xrefOffset,
        );

        return $pdf;
    }

    private function contentStream(string $text): string
    {
        $lines = [
            'BT /F1 18 Tf 72 760 Td ('.$this->escape($text).') Tj ET',
            'BT /F1 11 Tf 72 730 Td ('.$this->escape('Materiał demonstracyjny — PsychON').') Tj ET',
            'BT /F1 11 Tf 72 710 Td ('.$this->escape('Bez danych osobowych. Wygenerowano przez seeder H05.').') Tj ET',
        ];

        $stream = implode("\n", $lines);

        return sprintf("<< /Length %d >>\nstream\n%s\nendstream", strlen($stream), $stream);
    }

    /**
     * Helvetica/WinAnsi has no Polish diacritics — transliterating beats
     * emitting the „?" that a raw encoding conversion would leave behind.
     */
    private function escape(string $text): string
    {
        return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], Str::ascii($text));
    }
}
