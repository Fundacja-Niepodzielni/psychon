<?php

namespace App\Support;

use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * PDF rendering stub. FROZEN SIGNATURE.
 *
 * TODO(po hackathonie): swap the implementation for dompdf (or similar) —
 * the method contract stays the same: a Blade view + data in, a storage
 * path out. During the hackathon the rendered HTML is stored instead of
 * a real PDF, so the whole flow (jobs, download, paths in DB) works.
 */
final class PdfService
{
    /**
     * Render a Blade view and persist it. Returns the storage path
     * (local disk) to save in the `pdf_path` columns.
     */
    public static function render(string $view, array $data = []): string
    {
        $html = view($view, $data)->render();

        $path = 'pdf/'.now()->format('Y/m').'/'.Str::uuid().'.html';

        Storage::disk('local')->put($path, $html);

        return $path;
    }
}
