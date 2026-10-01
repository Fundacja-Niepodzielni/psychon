<?php

namespace Tests\Unit\DocumentTemplates;

use App\Support\PdfService;
use Closure;
use Dompdf\Options;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Bootstrap\HandleExceptions;
use Illuminate\Support\Facades\Facade;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Silnik PDF zamknięty w ramie dokumentu — próby ZACHOWANIA, nie odczytu opcji.
 *
 * Każda próba bierze silnik z `PdfService::engine()`, czyli taki, jakim powstaje
 * każdy dokument. Zasób wskazany w treści ma dostać odmowę i nie trafić do
 * wyniku — w każdej postaci, w jakiej treść może go wskazać.
 *
 * Dwie warstwy odmowy są sprawdzane osobno: w jednej próbie test sam poszerza
 * listę protokołów (zostaje rama), w drugiej sam poszerza ramę (zostaje lista
 * protokołów). Dzięki temu zdjęcie jednej warstwy z produktu czerwieni jej próbę,
 * zamiast zostać zasłonięte przez drugą.
 *
 * Miary:
 *  - ostrzeżenie silnika o odmowie dla TEGO zasobu (`$_dompdf_warnings`);
 *  - brak zasobu w wyniku: PDF jest generowany bez kompresji, a obraz próbny ma
 *    wypełnienie w kolorze, którego nie ma nigdzie indziej — kolor w bajtach
 *    znaczy „osadzony”; dla arkusza stylów miarą jest czcionka z jego reguły.
 *
 * Bez bazy: aplikacja jest podnoszona tutaj, bo próby nie dotykają danych.
 * `./vendor/bin/phpunit --no-configuration --bootstrap vendor/autoload.php tests/Unit/DocumentTemplates/PdfEngineFrameTest.php`
 */
final class PdfEngineFrameTest extends TestCase
{
    private const string SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#123456"/></svg>';

    /** Wypełnienie #123456 zapisane w strumieniu PDF. */
    private const string COLOUR = '~0\.07\d* 0\.20\d* 0\.33\d* rg~';

    private ?Application $app = null;

    private string $temporaryDirectory;

    private string $image;

    private string $stylesheet;

    protected function setUp(): void
    {
        parent::setUp();

        $app = require dirname(__DIR__, 3).'/bootstrap/app.php';
        $app->make(Kernel::class)->bootstrap();
        $this->app = $app;

        // Katalog tymczasowy leży WEWNĄTRZ aplikacji, a poza ramą dokumentu.
        $this->temporaryDirectory = storage_path('framework/testing/rama-silnika-'.Str::lower(Str::random(12)));
        File::ensureDirectoryExists($this->temporaryDirectory);

        $this->image = $this->temporaryDirectory.'/zasob-probny.svg';
        File::put($this->image, self::SVG);

        $this->stylesheet = $this->temporaryDirectory.'/zasob-probny.css';
        File::put($this->stylesheet, 'p { font-family: "DejaVu Serif"; }');
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->temporaryDirectory);

        $this->app?->flush();
        $this->app = null;
        HandleExceptions::flushState($this);
        Facade::clearResolvedInstances();
        Facade::setFacadeApplication(null);

        parent::tearDown();
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function imageAddresses(): array
    {
        return [
            // Plik tworzy test w katalogu aplikacji (`storage/framework/testing`) i sam go
            // sprząta — plik repozytorium nie dałby się zmierzyć kolorem wypełnienia.
            'ścieżka bezwzględna bez schematu, plik wewnątrz aplikacji' => ['bezwzgledna'],
            // Silnik rozwiązuje ścieżkę względną względem katalogu roboczego procesu
            // (ścieżka bazowa dokumentu jest pusta, bo treść przychodzi jako tekst).
            'ścieżka względna' => ['wzgledna'],
            'adres file://' => ['file'],
        ];
    }

    #[DataProvider('imageAddresses')]
    public function test_image_pointing_at_a_local_file_is_refused_and_not_embedded(string $form): void
    {
        $address = $this->address($form);

        $result = $this->render('<img src="'.$address.'" alt="">');

        $this->assertCount(1, $result['warnings']);
        $this->assertStringContainsString('Permission denied', $result['warnings'][0]);
        $this->assertStringContainsString('zasob-probny.svg', $result['warnings'][0]);
        $this->assertFalse($result['embedded']);

        // Kontrola miary: te same trzy adresy przy obu warstwach poszerzonych przez test
        // SĄ osadzane — odmowa wyżej nie jest więc skutkiem złego adresu.
        $open = $this->render('<img src="'.$address.'" alt="">', function (Options $options): void {
            $options->setAllowedProtocols(self::defaultProtocols());
            $options->setChroot(base_path());
        });

        $this->assertSame([], $open['warnings']);
        $this->assertTrue($open['embedded']);
    }

    public function test_the_same_image_inlined_in_the_content_is_embedded(): void
    {
        $result = $this->render('<img src="data:image/svg+xml;base64,'.base64_encode(self::SVG).'" alt="">');

        $this->assertSame([], $result['warnings']);
        $this->assertTrue($result['embedded']);
    }

    public function test_stylesheet_linked_from_a_local_file_is_refused_and_its_rule_is_not_applied(): void
    {
        $html = '<link rel="stylesheet" href="'.$this->stylesheet.'"><p>Tekst</p>';

        $result = $this->render($html);

        $this->assertCount(1, $result['warnings']);
        $this->assertStringContainsString('Permission denied', $result['warnings'][0]);
        $this->assertStringContainsString('zasob-probny.css', $result['warnings'][0]);
        $this->assertNotContains('DejaVuSerif', $result['fonts']);

        // Kontrola miary: przy obu warstwach poszerzonych reguła z pliku JEST zastosowana.
        $open = $this->render($html, function (Options $options): void {
            $options->setAllowedProtocols(self::defaultProtocols());
            $options->setChroot(base_path());
        });

        $this->assertSame([], $open['warnings']);
        $this->assertContains('DejaVuSerif', $open['fonts']);
    }

    /**
     * Warstwa pierwsza: sama RAMA. Test poszerza listę protokołów do domyślnej,
     * więc odmówić może już tylko katalog ramy.
     *
     * Rama znaczy tu „katalog ustawiony przez produkt”: przy ramie obejmującej cały
     * katalog zaplecza (tak było przed zamknięciem silnika) ten sam plik jest osadzany.
     */
    public function test_frame_alone_refuses_a_file_outside_it(): void
    {
        $widen = static function (Options $options): void {
            $options->setAllowedProtocols(self::defaultProtocols());
        };

        $own = $this->render('<img src="'.$this->image.'" alt="">', $widen);

        $this->assertCount(1, $own['warnings']);
        $this->assertStringContainsString('Options::chroot', $own['warnings'][0]);
        $this->assertStringContainsString('zasob-probny.svg', $own['warnings'][0]);
        $this->assertFalse($own['embedded']);

    }

    /**
     * FAKT o silniku, przypięty próbą: własny katalog biblioteki silnik dopuszcza
     * ZAWSZE, niezależnie od ustawionej ramy (dokleja go do listy katalogów przy
     * każdym sprawdzeniu). Leżą w nim wyłącznie zasoby biblioteki. Przy końcowych
     * opcjach plik z tego katalogu i tak dostaje odmowę — od listy protokołów;
     * sama rama by go nie zatrzymała.
     */
    public function test_engine_library_directory_is_outside_the_frame_and_is_stopped_by_the_protocol_list(): void
    {
        $library = base_path('vendor/dompdf/dompdf/lib/res/sRGB2014.icc.LICENSE');
        $this->assertFileExists($library);
        $html = '<link rel="stylesheet" href="'.$library.'"><p>Tekst</p>';

        $final = $this->render($html);

        $this->assertCount(1, $final['warnings']);
        $this->assertStringContainsString('The communication protocol is not supported', $final['warnings'][0]);
        $this->assertStringContainsString('sRGB2014.icc.LICENSE', $final['warnings'][0]);

        $widened = $this->render($html, static function (Options $options): void {
            $options->setAllowedProtocols(self::defaultProtocols());
        });

        // Bez listy protokołów plik biblioteki JEST czytany mimo ramy: nie ma odmowy,
        // jest tylko uwaga parsera, że jego treść nie jest arkuszem stylów.
        $this->assertCount(1, $widened['warnings']);
        $this->assertStringContainsString('Unable to parse CSS', $widened['warnings'][0]);
        $this->assertStringNotContainsString('Permission denied', $widened['warnings'][0]);
    }

    /**
     * Warstwa druga: sama LISTA PROTOKOŁÓW. Test ustawia ramę na katalog
     * obejmujący plik, więc odmówić może już tylko lista protokołów.
     */
    public function test_protocol_list_alone_refuses_a_file_inside_the_allowed_directory(): void
    {
        $result = $this->render('<img src="'.$this->image.'" alt="">', function (Options $options): void {
            $options->setChroot($this->temporaryDirectory);
        });

        $this->assertCount(1, $result['warnings']);
        $this->assertStringContainsString('The communication protocol is not supported', $result['warnings'][0]);
        $this->assertStringContainsString('zasob-probny.svg', $result['warnings'][0]);
        $this->assertFalse($result['embedded']);
    }

    private function address(string $form): string
    {
        if ($form === 'file') {
            return 'file://'.$this->image;
        }

        if ($form === 'wzgledna') {
            $workingDirectory = (string) getcwd();
            $this->assertStringStartsWith($workingDirectory, $this->image, 'Katalog tymczasowy testu musi leżeć pod katalogiem roboczym procesu.');

            return ltrim(str_replace(DIRECTORY_SEPARATOR, '/', substr($this->image, strlen($workingDirectory))), '/');
        }

        return $this->image;
    }

    /**
     * @return list<string>
     */
    private static function defaultProtocols(): array
    {
        return array_keys((new Options)->getAllowedProtocols());
    }

    /**
     * @param  (Closure(Options): void)|null  $change  zmiana opcji robiona przez TEST na silniku produktu
     * @return array{warnings: list<string>, embedded: bool, fonts: list<string>}
     */
    private function render(string $body, ?Closure $change = null): array
    {
        $GLOBALS['_dompdf_warnings'] = [];

        $engine = PdfService::engine();

        if ($change !== null) {
            $change($engine->getOptions());
        }

        $engine->loadHtml('<html><head></head><body>'.$body.'</body></html>', 'UTF-8');
        $engine->render();
        $bytes = (string) $engine->output(['compress' => 0]);

        $this->assertStringStartsWith('%PDF', $bytes);

        preg_match_all('~/BaseFont\s*/(?:[A-Z]{6}\+)?([A-Za-z0-9-]+)~', $bytes, $fonts);

        return [
            'warnings' => array_values((array) $GLOBALS['_dompdf_warnings']),
            'embedded' => preg_match(self::COLOUR, $bytes) === 1,
            'fonts' => array_values(array_unique($fonts[1])),
        ];
    }
}
