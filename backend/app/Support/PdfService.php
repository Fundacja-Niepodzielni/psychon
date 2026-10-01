<?php

namespace App\Support;

use App\Services\DocumentTemplates\DocumentTemplateRenderer;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

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
 *
 * Silnik jest zamknięty w ramie dokumentu:
 *  - jedynym katalogiem ramy jest `resources/pdf-frame` (pusty), a adresy
 *    plików (`file://`, `phar://`) dostają odmowę zawsze — odpowiedź silnika
 *    nie zależy więc od tego, czy wskazany plik istnieje na serwerze;
 *  - adres `data:` jest ładowany WYŁĄCZNIE wtedy, gdy jest równy (cały napis)
 *    jednemu z adresów na liście przekazanej do TEGO generowania. Listę buduje
 *    serwer w miejscu wywołania (dziś: kod QR certyfikatu); adres z treści wzoru
 *    ani z żądania nigdy na nią nie trafia. Pusta lista = żaden adres `data:`;
 *  - wykonywanie PHP osadzonego w treści i skrypty PDF są wyłączone jawnie,
 *    niezależnie od ustawień domyślnych biblioteki.
 */
final class PdfService
{
    /** Początek komunikatu każdej odmowy reguły — taki sam jak w odmowach biblioteki. */
    public const string REFUSAL = 'Permission denied';

    /**
     * Renderuje widok Blade do PDF i zapisuje go. Zwraca ścieżkę na dysku
     * `local` do zapisania w kolumnach `pdf_path`.
     *
     * Używane dziś tylko przez certyfikaty (`Certificate::$pdf_path`) —
     * dokumenty H14 mają trwały plik zastąpiony renderem na żądanie
     * (`renderBytes()`), więc dla nich ten wariant już nie wchodzi w grę.
     *
     * @param  array<string, mixed>  $data
     * @param  list<string>  $allowedDataUris  adresy `data:` zbudowane przez serwer dla tego dokumentu
     */
    public static function render(string $view, array $data = [], array $allowedDataUris = []): string
    {
        $path = 'pdf/'.now()->format('Y/m').'/'.Str::uuid().'.pdf';

        Storage::disk('local')->put($path, self::renderBytes($view, $data, $allowedDataUris));

        return $path;
    }

    /**
     * To samo renderowanie, ale bez zapisu na dysk — zwraca gotowe bajty
     * PDF-a. Dla migawek dokumentów (dane osobowe: PESEL, adres) to jedyna
     * droga: plik nigdy nie powstaje w magazynie, więc nie ma czego rotować
     * ani szyfrować obok bazy.
     *
     * @param  array<string, mixed>  $data
     * @param  list<string>  $allowedDataUris  adresy `data:` zbudowane przez serwer dla tego dokumentu
     */
    public static function renderBytes(string $view, array $data = [], array $allowedDataUris = []): string
    {
        $stored = DocumentTemplateRenderer::storedHtml($view, $data);

        if ($stored !== null) {
            // Siatka wyłącznie wokół renderu treści z bazy: wzór, na którym silnik
            // się wywraca albo który przekracza limit wejścia, nie może zatrzymać
            // wydawania dokumentów. Dokument powstaje wtedy z pliku w repozytorium,
            // a w dzienniku zostaje jeden wpis — bez treści wzoru, bez komunikatu
            // wyjątku (bywa w nim ścieżka albo fragment treści) i bez danych osoby.
            try {
                return self::bytesFromHtml($stored['html'], $allowedDataUris);
            } catch (Throwable $exception) {
                Log::error('Wzór dokumentu z bazy nie dał się wygenerować; dokument powstał z wzoru domyślnego.', [
                    'type' => $stored['type'],
                    'version' => $stored['version'],
                    'exception' => $exception::class,
                ]);
            }
        }

        // Render z pliku w repozytorium nie jest łapany: błąd w zaufanym pliku ma być
        // widoczny. Dostaje tę samą listę adresów co treść z bazy.
        return self::bytesFromHtml(DocumentTemplateRenderer::fileHtml($view, $data), $allowedDataUris);
    }

    /**
     * Gotowy HTML dokumentu -> bajty PDF-a, zawsze z ustawieniami ramy.
     *
     * @param  list<string>  $allowedDataUris  adresy `data:` zbudowane przez serwer dla tego dokumentu
     */
    public static function bytesFromHtml(string $html, array $allowedDataUris = []): string
    {
        return (string) self::generated($html, $allowedDataUris)->output();
    }

    /**
     * Pełna droga generowania: silnik z ramą i render. Zwraca silnik
     * po renderze — próby czytają z niego dokument bez kompresji, tą samą drogą,
     * którą powstaje każdy dokument.
     *
     * @param  list<string>  $allowedDataUris  adresy `data:` zbudowane przez serwer dla tego dokumentu
     */
    public static function generated(string $html, array $allowedDataUris = []): Dompdf
    {
        $dompdf = self::engine($allowedDataUris);
        $dompdf->loadHtml($html, 'UTF-8');

        $dompdf->render();

        return $dompdf;
    }

    /**
     * Silnik gotowy do generowania — jedyne miejsce, w którym powstaje. Próby
     * czytają ustawienia z obiektu zwróconego stąd, czyli takiego samego, jakim
     * generowany jest każdy dokument, a nie z kopii ustawień.
     *
     * @param  list<string>  $allowedDataUris  adresy `data:` zbudowane przez serwer dla tego dokumentu
     */
    public static function engine(array $allowedDataUris = []): Dompdf
    {
        $dompdf = new Dompdf(self::options($allowedDataUris));
        $dompdf->setPaper('A4', 'portrait');

        return $dompdf;
    }

    /**
     * Ustawienia silnika — jedno miejsce.
     *
     * @param  list<string>  $allowedDataUris
     */
    private static function options(array $allowedDataUris): Options
    {
        $options = new Options;
        $options->setIsRemoteEnabled(false);
        $options->setIsPhpEnabled(false);
        $options->setIsJavascriptEnabled(false);
        $options->setIsHtml5ParserEnabled(true);
        $options->setDefaultFont('DejaVu Sans'); // jedyna wbudowana rodzina z polskimi znakami
        $options->setChroot(self::frameDirectory());
        $options->setAllowedProtocols([
            'data://' => ['rules' => [self::dataUriRule($allowedDataUris)]],
            // Adresy plików są na liście po to, żeby miały REGUŁĘ, która zawsze odmawia:
            // protokół spoza listy biblioteka w części miejsc kończy błędem tylko wtedy,
            // gdy plik istnieje — a odpowiedź nie może zależeć od tego, co leży na dysku.
            'file://' => ['rules' => [self::refuseFiles(...)]],
            'phar://' => ['rules' => [self::refuseFiles(...)]],
        ]);

        return $options;
    }

    /**
     * Reguła adresów `data:`: przechodzi wyłącznie adres równy jednemu z adresów
     * listy tego generowania. Biblioteka podaje regule adres po zdekodowaniu encji
     * HTML, bez żadnej innej zmiany (wielkość liter i białe znaki zostają).
     *
     * @param  list<string>  $allowedDataUris
     * @return callable(string): array{0: bool, 1: string|null}
     */
    private static function dataUriRule(array $allowedDataUris): callable
    {
        return static fn (string $uri): array => in_array($uri, $allowedDataUris, true)
            ? [true, null]
            : [false, self::REFUSAL.': adres danych spoza listy tego dokumentu.'];
    }

    /**
     * @return array{0: bool, 1: string}
     */
    private static function refuseFiles(string $uri): array
    {
        return [false, self::REFUSAL.': dokument nie czyta plików.'];
    }

    /**
     * Katalog ramy dokumentu: jedyny, z którego silnik mógłby czytać zasoby treści.
     */
    public static function frameDirectory(): string
    {
        return resource_path('pdf-frame');
    }
}
