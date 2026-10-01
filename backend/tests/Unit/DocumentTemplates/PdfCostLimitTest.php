<?php

namespace Tests\Unit\DocumentTemplates;

use App\Services\DocumentTemplates\DocumentCostLimit;
use App\Services\DocumentTemplates\DocumentTemplateFields;
use App\Services\DocumentTemplates\DocumentTemplateSampleData;
use App\Services\DocumentTemplates\DocumentTemplateTrial;
use App\Services\DocumentTemplates\DocumentTooCostly;
use App\Support\PdfService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Bootstrap\HandleExceptions;
use Illuminate\Support\Facades\Facade;
use Illuminate\Support\Facades\File;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Limit wejścia jednego generowania dokumentu.
 *
 * Wejścia tanie w zapisie, a drogie w generowaniu, są odrzucane wyjątkiem własnej
 * klasy, zanim zaczną kosztować: na drzewie dokumentu przed renderem (elementy,
 * głębokość, scalenia komórek) i na pierwszej stronie ponad limit. Zwykłe wzory —
 * także dziesięć razy większe od wzorów z repozytorium — przechodzą.
 *
 * Scalenie 65 000 × 65 000 jest sprawdzane NAJPIERW na samym limicie, bez renderu:
 * bez limitu to wejście wyczerpuje pamięć procesu, więc próba nie może dopuścić do
 * jego renderu, zanim nie zobaczy odmowy.
 *
 * Bez bazy: aplikacja jest podnoszona tutaj.
 * `./vendor/bin/phpunit --no-configuration --bootstrap vendor/autoload.php tests/Unit/DocumentTemplates/PdfCostLimitTest.php`
 */
final class PdfCostLimitTest extends TestCase
{
    private ?Application $app = null;

    protected function setUp(): void
    {
        parent::setUp();

        $app = require dirname(__DIR__, 3).'/bootstrap/app.php';
        $app->make(Kernel::class)->bootstrap();
        $this->app = $app;
    }

    protected function tearDown(): void
    {
        $this->app?->flush();
        $this->app = null;
        HandleExceptions::flushState($this);
        Facade::clearResolvedInstances();
        Facade::setFacadeApplication(null);

        parent::tearDown();
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function treeLimits(): array
    {
        return [
            'scalenie komórek 65 000 × 65 000' => ['<table><tr><td colspan="65000" rowspan="65000">x</td></tr></table>', 'span'],
            'to samo scalenie zapisane encjami' => ['<table><tr><td colspan="&#54;5000" rowspan="&#54;5000">x</td></tr></table>', 'span'],
            'scalenie tuż ponad limit jednej komórki' => ['<table><tr><td colspan="'.(DocumentCostLimit::MAX_SPAN + 1).'">x</td></tr></table>', 'span'],
            'suma scaleń ponad limit dokumentu' => ['<table>'.str_repeat('<tr><td colspan="50" rowspan="50">x</td></tr>', 2).'</table>', 'span'],
            'tysiąc zagnieżdżonych tabel' => [str_repeat('<table><tr><td>', 1000), 'depth'],
            'elementów ponad limit' => [str_repeat('<b>x</b>', DocumentCostLimit::MAX_ELEMENTS + 1), 'elements'],
        ];
    }

    /**
     * Sam limit, bez renderu: drzewo zbudowane przez silnik jest odrzucane przed generowaniem.
     */
    #[DataProvider('treeLimits')]
    public function test_tree_over_the_limit_is_refused_before_rendering(string $content, string $limit): void
    {
        $engine = PdfService::engine();
        $engine->loadHtml($content, 'UTF-8');

        $started = hrtime(true);

        try {
            DocumentCostLimit::guard($engine);
            $this->fail('Limit wejścia nie zatrzymał dokumentu przed renderem.');
        } catch (DocumentTooCostly $exception) {
            $this->assertSame($limit, $exception->limit);
            // Komunikat wyjątku niesie nazwę limitu i nic z treści.
            $this->assertSame('Dokument przekracza limit generowania: '.$limit.'.', $exception->getMessage());
        }

        $this->assertLessThan(2.0, (hrtime(true) - $started) / 1e9);
    }

    /**
     * Trzy wejścia tanie w zapisie i drogie w generowaniu — pełną drogą generowania.
     *
     * @return array<string, array{0: string, 1: string}>
     */
    public static function costlyInputs(): array
    {
        return [
            'scalenie komórek 65 000 × 65 000' => ['<table><tr><td colspan="65000" rowspan="65000">x</td></tr></table>', 'span'],
            'tysiąc zagnieżdżonych tabel' => [str_repeat('<table><tr><td>', 1000), 'depth'],
            '450 wymuszonych stron i wysokość 100 000 cm' => [str_repeat('<div style="page-break-after:always"></div>', 450).'<div style="height:100000cm">x</div>', 'pages'],
        ];
    }

    #[DataProvider('costlyInputs')]
    public function test_costly_input_is_refused_within_two_seconds_on_the_full_generation_path(string $content, string $limit): void
    {
        // Bezpiecznik próby: wejście wyczerpujące pamięć nie trafia do renderu, dopóki
        // sam limit go nie odrzuca (dla limitu stron odmowa pada dopiero w renderze).
        if ($limit !== 'pages') {
            $engine = PdfService::engine();
            $engine->loadHtml($content, 'UTF-8');

            try {
                DocumentCostLimit::guard($engine);
                $this->fail('Limit wejścia nie zatrzymał dokumentu przed renderem.');
            } catch (DocumentTooCostly) {
                // dalej pełna droga
            }
        }

        $started = hrtime(true);

        try {
            PdfService::bytesFromHtml($content);
            $this->fail('Generowanie nie zostało odrzucone.');
        } catch (DocumentTooCostly $exception) {
            $this->assertSame($limit, $exception->limit);
        }

        $this->assertLessThan(2.0, (hrtime(true) - $started) / 1e9);

        // Przy zapisie wzoru to samo wejście jest odmową z własnym zdaniem.
        $this->assertSame(DocumentTemplateTrial::TOO_COSTLY_MESSAGE, DocumentTemplateTrial::failure('agreement', $content));
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function templateTypes(): array
    {
        return [
            'porozumienie' => ['agreement'],
            'zaświadczenie' => ['attendance_certificate'],
            'certyfikat' => ['certificate'],
        ];
    }

    #[DataProvider('templateTypes')]
    public function test_repository_template_and_one_ten_times_larger_stay_within_the_limit(string $type): void
    {
        $content = (string) File::get(resource_path('document-templates/'.$type.'.html'));

        foreach ([1, 10] as $times) {
            $html = DocumentTemplateFields::render($type, str_repeat($content, $times), DocumentTemplateSampleData::for($type));

            $engine = PdfService::engine();
            $engine->loadHtml($html, 'UTF-8');
            $measure = DocumentCostLimit::measure($engine->getDom()->documentElement);

            $this->assertNull($measure['exceeded']);
            // Zapas: wzór dziesięć razy większy nie zbliża się do żadnego limitu drzewa.
            $this->assertLessThan(DocumentCostLimit::MAX_ELEMENTS / 4, $measure['elements']);
            $this->assertLessThan(DocumentCostLimit::MAX_DEPTH / 4, $measure['depth']);

            $generated = PdfService::generated($html, DocumentTemplateSampleData::allowedDataUris($type));

            $this->assertSame($times, $generated->getCanvas()->get_page_count());
            $this->assertStringStartsWith('%PDF', (string) $generated->output());
        }
    }

    public function test_values_at_the_limit_pass(): void
    {
        $cell = '<table><tr><td colspan="'.DocumentCostLimit::MAX_SPAN.'" rowspan="'.intdiv(DocumentCostLimit::MAX_SPAN_AREA, DocumentCostLimit::MAX_SPAN).'">x</td></tr></table>';
        $this->assertStringStartsWith('%PDF', PdfService::bytesFromHtml($cell));

        $pages = str_repeat('<div style="page-break-after:always">x</div>', DocumentCostLimit::MAX_PAGES - 1).'<div>x</div>';
        $generated = PdfService::generated($pages);
        $this->assertSame(DocumentCostLimit::MAX_PAGES, $generated->getCanvas()->get_page_count());

        try {
            PdfService::bytesFromHtml('<div style="page-break-after:always">x</div>'.$pages);
            $this->fail('Dokument o jedną stronę za długi nie został odrzucony.');
        } catch (DocumentTooCostly $exception) {
            $this->assertSame('pages', $exception->limit);
        }
    }
}
