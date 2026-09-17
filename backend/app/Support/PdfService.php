<?php

namespace App\Support;

use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Renderer dokumentów PDF. SYGNATURA ZAMROŻONA: widok Blade + dane na wejściu,
 * ścieżka na dysku `local` na wyjściu.
 *
 * Podczas hackathonu zapisywany był surowy HTML pod nazwą `.html` — cały obieg
 * (zadania, pobieranie, kolumny `pdf_path`) działał, ale plik nie był PDF-em.
 * Teraz render idzie przez dompdf, więc plik zaczyna się od `%PDF`.
 *
 * Obraz kontenera nie ma `gd` ani `imagick`, dlatego rasteryzacja obrazów jest
 * wyłączona, a kod QR wchodzi do dokumentu jako SVG (php-svg-lib z dompdf).
 * Pobieranie zdalnych zasobów zostaje wyłączone: dokument ma się renderować
 * z własnej treści, nie z sieci.
 */
final class PdfService
{
    /**
     * Renderuje widok Blade do PDF i zapisuje go. Zwraca ścieżkę na dysku
     * `local` do zapisania w kolumnach `pdf_path`.
     *
     * Używane dziś tylko przez certyfikaty (`Certificate::$pdf_path`) —
     * dokumenty H14 mają trwały plik zastąpiony renderem na żądanie
     * (`renderBytes()`), więc dla nich ten wariant już nie wchodzi w grę.
     */
    public static function render(string $view, array $data = []): string
    {
        $path = 'pdf/'.now()->format('Y/m').'/'.Str::uuid().'.pdf';

        Storage::disk('local')->put($path, self::renderBytes($view, $data));

        return $path;
    }

    /**
     * To samo renderowanie, ale bez zapisu na dysk — zwraca gotowe bajty
     * PDF-a. Dla migawek dokumentów (dane osobowe: PESEL, adres) to jedyna
     * droga: plik nigdy nie powstaje w magazynie, więc nie ma czego rotować
     * ani szyfrować obok bazy.
     */
    public static function renderBytes(string $view, array $data = []): string
    {
        $html = view($view, $data)->render();

        $options = new Options;
        $options->setIsRemoteEnabled(false);
        $options->setIsHtml5ParserEnabled(true);
        $options->setDefaultFont('DejaVu Sans'); // jedyna wbudowana rodzina z polskimi znakami
        $options->setChroot(base_path());

        $dompdf = new Dompdf($options);
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->loadHtml($html, 'UTF-8');
        $dompdf->render();

        return (string) $dompdf->output();
    }
}
