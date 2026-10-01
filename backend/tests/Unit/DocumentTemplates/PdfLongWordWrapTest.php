<?php

namespace Tests\Unit\DocumentTemplates;

use App\Services\DocumentTemplates\DocumentTemplateRenderer;
use App\Support\PdfService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Bootstrap\HandleExceptions;
use Illuminate\Support\Facades\Facade;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Wyraz dłuższy niż wiersz jest w dokumencie łamany, a nie wychodzi poza stronę.
 *
 * Reguła łamania stoi w jednym miejscu — w arkuszu bazowym usługi generowania,
 * dokładanym przed stylami wzoru — więc obejmuje każdy wzór bez zmiany jego treści.
 *
 * Miara (strumień dokumentu bez kompresji, napisy operatorów tekstu): wartość pola
 * to 10 000 liter „W” bez spacji. Bez łamania cała wartość jest JEDNYM napisem, który
 * wychodzi poza stronę; z łamaniem — wieloma napisami nie dłuższymi niż wiersz.
 * Liczone są ciągi co najmniej dwóch „W”, więc pojedyncze „W” ze stałego tekstu
 * wzoru nie wchodzą do sumy.
 *
 * Bez bazy: aplikacja jest podnoszona tutaj.
 * `./vendor/bin/phpunit --no-configuration --bootstrap vendor/autoload.php tests/Unit/DocumentTemplates/PdfLongWordWrapTest.php`
 */
final class PdfLongWordWrapTest extends TestCase
{
    private const int LENGTH = 10000;

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
     * Najdłuższy napis = tyle liter „W”, ile mieści wiersz w miejscu pola (z pomiaru).
     *
     * @return array<string, array{0: string, 1: int}>
     */
    public static function templatesFromFiles(): array
    {
        return [
            'porozumienie, komórka tabeli' => ['agreement', 28],
            'zaświadczenie, komórka tabeli' => ['attendance_certificate', 28],
        ];
    }

    #[DataProvider('templatesFromFiles')]
    public function test_field_value_longer_than_a_line_is_broken_into_lines_in_the_template_from_the_file(string $type, int $lineWidth): void
    {
        $case = (require base_path('tests/Fixtures/DocumentTemplates/golden-data.php'))[$type];
        $case['data']['first_name'] = str_repeat('W', self::LENGTH);

        $generated = PdfService::generated(DocumentTemplateRenderer::fileHtml($case['view'], $case['data']));
        $runs = self::runs((string) $generated->output(['compress' => 0]));

        $this->assertSame(self::LENGTH, array_sum($runs), 'W dokumencie nie ma całej wartości pola.');
        $this->assertLessThanOrEqual($lineWidth, max($runs), 'Wartość pola nie została połamana na wiersze.');
        $this->assertGreaterThanOrEqual(2, $generated->getCanvas()->get_page_count());
    }

    /**
     * Zwykłe dane: arkusz bazowy niczego nie zmienia — ta sama liczba stron i ten sam
     * tekst co w dokumencie wygenerowanym bez arkusza.
     */
    #[DataProvider('templatesFromFiles')]
    public function test_ordinary_data_give_the_same_text_and_page_count_as_without_the_base_stylesheet(string $type): void
    {
        $case = (require base_path('tests/Fixtures/DocumentTemplates/golden-data.php'))[$type];
        $html = DocumentTemplateRenderer::fileHtml($case['view'], $case['data']);

        $with = PdfService::generated($html);

        $without = PdfService::engine();
        $without->loadHtml($html, 'UTF-8');
        $without->render();

        $this->assertSame(1, $with->getCanvas()->get_page_count());
        $this->assertSame($without->getCanvas()->get_page_count(), $with->getCanvas()->get_page_count());
        $this->assertSame(
            self::strings((string) $without->output(['compress' => 0])),
            self::strings((string) $with->output(['compress' => 0])),
        );
    }

    public function test_template_can_override_the_base_stylesheet(): void
    {
        $word = str_repeat('W', 500);

        $default = self::runs((string) PdfService::generated('<html><head></head><body><p>'.$word.'</p></body></html>')->output(['compress' => 0]));
        $overridden = self::runs((string) PdfService::generated('<html><head><style>body { overflow-wrap: normal; }</style></head><body><p>'.$word.'</p></body></html>')->output(['compress' => 0]));

        $this->assertSame(500, array_sum($default));
        $this->assertLessThanOrEqual(44, max($default), 'Arkusz bazowy nie połamał wyrazu.');
        $this->assertSame([500], $overridden, 'Styl wzoru nie nadpisał arkusza bazowego.');
    }

    /**
     * Napisy operatorów tekstu z dokumentu bez kompresji, w kolejności strumienia.
     *
     * @return list<string>
     */
    public static function strings(string $bytes): array
    {
        preg_match_all('~\[(.*?)\]\s*TJ|\((.*?)(?<!\\\\)\)\s*Tj~s', $bytes, $operators, PREG_SET_ORDER);
        $strings = [];

        foreach ($operators as $operator) {
            if ($operator[1] !== '') {
                preg_match_all('~\((.*?)(?<!\\\\)\)~s', $operator[1], $parts);
                $strings[] = implode('', $parts[1]);
            } else {
                $strings[] = $operator[2] ?? '';
            }
        }

        return $strings;
    }

    /**
     * Długości ciągów co najmniej dwóch liter „W” w napisach dokumentu.
     *
     * Czcionka wbudowana zapisuje znak dwoma bajtami (zerowy i właściwy), czcionka
     * podstawowa jednym — bajt zerowy jest pomijany, żeby miara była jedna.
     *
     * @return list<int>
     */
    public static function runs(string $bytes): array
    {
        $runs = [];

        foreach (self::strings($bytes) as $string) {
            preg_match_all('~W{2,}~', str_replace(chr(0), '', $string), $found);

            foreach ($found[0] as $run) {
                $runs[] = strlen($run);
            }
        }

        return $runs === [] ? [0] : $runs;
    }
}
