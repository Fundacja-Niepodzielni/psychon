<?php

namespace Tests\Unit\DocumentTemplates;

use App\Services\DocumentTemplates\DocumentTemplateFields;
use App\Services\DocumentTemplates\DocumentTemplateRenderer;
use App\Services\DocumentTemplates\DocumentTemplateSampleData;
use App\Services\DocumentTemplates\DocumentTemplateTrial;
use App\Support\PdfService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Bootstrap\HandleExceptions;
use Illuminate\Support\Facades\Facade;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Adres `data:` w dokumencie jest wczytywany WYŁĄCZNIE wtedy, gdy stoi na liście
 * przekazanej do tego jednego generowania. Lista powstaje po stronie serwera;
 * treść wzoru niczego na nią nie dopisuje.
 *
 * Każda próba idzie pełną drogą generowania (`PdfService::generated()` — ta sama,
 * którą powstaje każdy dokument) i mierzy SKUTEK w dokumencie, nie ustawienia:
 *  - dokument jest czytany bez kompresji (`output(['compress' => 0])`), więc w
 *    jego bajtach widać nazwy użytych czcionek (`/BaseFont`) i kolory wypełnień;
 *  - arkusz próbny zmienia czcionkę akapitu na „DejaVu Serif” — zastosowany
 *    zostawia w dokumencie czcionkę `DejaVuSerif`;
 *  - obraz próbny ma wypełnienie w kolorze #123456, którego nie ma nigdzie
 *    indziej — kolor w bajtach znaczy „obraz wczytany i narysowany”.
 *
 * Bez bazy: aplikacja jest podnoszona tutaj.
 * `./vendor/bin/phpunit --no-configuration --bootstrap vendor/autoload.php tests/Unit/DocumentTemplates/PdfDataAddressListTest.php`
 */
final class PdfDataAddressListTest extends TestCase
{
    private const string SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#123456"/></svg>';

    /** Wypełnienie #123456 zapisane w strumieniu PDF. */
    private const string COLOUR = '~0\.07\d* 0\.20\d* 0\.33\d* rg~';

    private const string STYLESHEET = 'p { font-family: "DejaVu Serif"; }';

    private ?Application $app = null;

    private string $temporaryDirectory;

    protected function setUp(): void
    {
        parent::setUp();

        $app = require dirname(__DIR__, 3).'/bootstrap/app.php';
        $app->make(Kernel::class)->bootstrap();
        $this->app = $app;

        $this->temporaryDirectory = storage_path('framework/testing/lista-adresow-'.Str::lower(Str::random(12)));
        File::ensureDirectoryExists($this->temporaryDirectory);
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

    public function test_image_is_drawn_only_when_its_address_is_on_the_list_of_this_generation(): void
    {
        $address = self::image();
        $html = '<img src="'.$address.'" alt="">';

        $listed = $this->generate($html, [$address]);
        $this->assertSame([], $listed['warnings']);
        $this->assertTrue($listed['drawn']);

        // Pusta lista: żaden adres `data:` nie przechodzi.
        $empty = $this->generate($html, []);
        $this->assertCount(1, $empty['warnings']);
        $this->assertStringContainsString(PdfService::REFUSAL.': adres danych spoza listy', $empty['warnings'][0]);
        $this->assertFalse($empty['drawn']);

        // Lista z INNYM adresem: równość całego napisu, nie początku ani rodzaju.
        $other = $this->generate($html, [$address.'=', substr($address, 0, -1), 'data:image/svg+xml;base64,']);
        $this->assertCount(1, $other['warnings']);
        $this->assertFalse($other['drawn']);
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function stylesheetCarriers(): array
    {
        return [
            'znacznik link' => ['<link rel="stylesheet" href="__ARKUSZ__">'],
            'reguła @import' => ['<style>@import url("__ARKUSZ__");</style>'],
        ];
    }

    #[DataProvider('stylesheetCarriers')]
    public function test_stylesheet_from_a_data_address_is_not_applied(string $carrier): void
    {
        $address = 'data:text/css;base64,'.base64_encode(self::STYLESHEET);
        $head = str_replace('__ARKUSZ__', $address, $carrier);

        $result = $this->generate('<p>Tekst akapitu</p>', [], $head);

        $this->assertCount(1, $result['warnings']);
        $this->assertStringContainsString(PdfService::REFUSAL.': adres danych spoza listy', $result['warnings'][0]);
        // Skutek: akapit został przy czcionce wyjściowej dokumentu.
        $this->assertSame(['DejaVuSans'], $result['fonts']);

        // Kontrola miary: ten sam arkusz z listy JEST zastosowany — brak czcionki wyżej
        // jest więc skutkiem odmowy, a nie wadliwego arkusza.
        $listed = $this->generate('<p>Tekst akapitu</p>', [$address], $head);
        $this->assertSame([], $listed['warnings']);
        $this->assertSame(['DejaVuSerif'], $listed['fonts']);
    }

    /**
     * Czcionka z adresu `data:` nie jest ani wczytywana, ani zapisywana w katalogu
     * czcionek silnika (to katalog biblioteki — innego ta próba nie ma do dyspozycji).
     * Miara: spis plików katalogu przed i po generowaniu.
     *
     * Gdyby bariera zniknęła, silnik zapisałby tam czcionkę; próba usuwa wtedy
     * WYŁĄCZNIE pliki, których nie było w spisie sprzed generowania — czyli te,
     * które sama spowodowała — i dopiero potem zgłasza błąd.
     */
    public function test_font_from_a_data_address_is_not_installed_in_the_font_directory(): void
    {
        $directory = PdfService::engine()->getOptions()->getFontDir();

        // Silnik przy pierwszym użyciu czcionki wbudowanej zapisuje obok niej pamięć jej
        // metryk. Ten sam akapit bez reguły czcionki generowany jest więc raz przed spisem.
        $this->generate('<p>Tekst</p>', []);
        $before = $this->listing($directory);

        $font = 'data:font/ttf;base64,'.base64_encode((string) File::get($directory.'/DejaVuSerif.ttf'));
        $head = '<style>@font-face { font-family: probna; src: url("'.$font.'") format("truetype"); }</style>';

        try {
            $result = $this->generate('<p style="font-family: probna">Tekst</p>', [], $head);
            $after = $this->listing($directory);
        } finally {
            foreach (array_diff($this->listing($directory), $before) as $created) {
                File::delete($directory.'/'.$created);
            }
        }

        $this->assertSame($before, $after, 'Generowanie zapisało plik w katalogu czcionek silnika.');
        $this->assertCount(1, $result['warnings']);
        $this->assertStringContainsString(PdfService::REFUSAL.': adres danych spoza listy', $result['warnings'][0]);
        $this->assertSame(['DejaVuSans'], $result['fonts']);
    }

    /**
     * Obraz SVG z rozgałęzionym `<use>` (pięć poziomów po dziesięć odwołań —
     * sto tysięcy kształtów): spoza listy nie jest nawet czytany.
     */
    public function test_svg_with_branching_references_outside_the_list_is_not_expanded(): void
    {
        $shapes = "<rect id='a0' width='1' height='1' fill='#123456'/>";

        for ($level = 1; $level <= 5; $level++) {
            $shapes .= "<g id='a{$level}'>".str_repeat("<use xlink:href='#a".($level - 1)."'/>", 10).'</g>';
        }

        $svg = "<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='10' height='10'><defs>{$shapes}</defs><use xlink:href='#a5'/></svg>";
        $address = 'data:image/svg+xml;base64,'.base64_encode($svg);

        $started = hrtime(true);
        $result = $this->generate('<img src="'.$address.'" alt="">', []);
        $seconds = (hrtime(true) - $started) / 1e9;

        $this->assertLessThan(2.0, $seconds);
        $this->assertCount(1, $result['warnings']);
        $this->assertStringContainsString(PdfService::REFUSAL.': adres danych spoza listy', $result['warnings'][0]);
        $this->assertFalse($result['drawn']);
    }

    /**
     * Wartość pola wstawiona w adres `data:` zmienia ten adres. Nawet gdyby serwer
     * dopuścił adres z wartością niewinną, adres po podstawieniu innej wartości
     * jest innym napisem — nie ma go na liście i obraz nie jest wczytywany.
     */
    public function test_field_value_inside_a_data_address_takes_the_address_off_the_list(): void
    {
        $template = '<img src="data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'40\'><text y=\'20\'>{{ $first_name }}</text></svg>" alt="">';
        $innocent = 'data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'40\'><text y=\'20\'>Anna</text></svg>';
        $injected = '</text><rect width=\'40\' height=\'40\' fill=\'rgb(18,52,86)\'/><text>';

        // Wartość niewinna: adres po podstawieniu jest równy adresowi z listy.
        $plain = $this->generate(DocumentTemplateFields::render('agreement', $template, ['first_name' => 'Anna']), [$innocent]);
        $this->assertSame([], $plain['warnings']);

        // Wartość zmieniająca strukturę obrazu: silnik dostaje adres z wstrzykniętym kształtem…
        $changed = $this->generate(DocumentTemplateFields::render('agreement', $template, ['first_name' => $injected]), [$innocent]);
        $this->assertCount(1, $changed['warnings']);
        $this->assertStringContainsString(PdfService::REFUSAL.': adres danych spoza listy', $changed['warnings'][0]);
        $this->assertStringContainsString('<rect', $changed['warnings'][0]);
        // …i go nie rysuje.
        $this->assertFalse($changed['drawn']);

        // Kontrola miary: ten sam adres dopisany do listy JEST rysowany — wstrzyknięcie działa,
        // zatrzymuje je wyłącznie lista.
        $address = str_replace('Anna', $injected, $innocent);
        $drawn = $this->generate(DocumentTemplateFields::render('agreement', $template, ['first_name' => $injected]), [$address]);
        $this->assertSame([], $drawn['warnings']);
        $this->assertTrue($drawn['drawn']);
    }

    /**
     * Zapisy omijające regułę „@ + litera” w treści wzoru. Silnik żadnego z nich
     * nie rozpoznaje jako reguły wczytującej zasób: skutek w dokumencie jest
     * żaden — ani arkusza, ani czcionki, ani pliku w katalogu czcionek.
     *
     * @return array<string, array{0: string}>
     */
    public static function atRuleBypasses(): array
    {
        return [
            'znak ucieczki w nazwie reguły' => ['<style>@\\69mport url("__ARKUSZ__");</style>'],
            'litera przed znakiem @, import' => ['<style>x@import url("__ARKUSZ__");</style>'],
            'litera przed znakiem @, czcionka' => ['<style>x@font-face { font-family: probna; src: url("__CZCIONKA__") format("truetype"); } p { font-family: probna; }</style>'],
        ];
    }

    #[DataProvider('atRuleBypasses')]
    public function test_at_rule_written_around_the_content_rule_loads_nothing(string $head): void
    {
        $directory = PdfService::engine()->getOptions()->getFontDir();

        // Pamięć metryk czcionki wbudowanej powstaje przy pierwszym użyciu — przed spisem.
        $this->generate('<p>Tekst akapitu</p>', []);
        $before = $this->listing($directory);

        $head = strtr($head, [
            '__ARKUSZ__' => 'data:text/css;base64,'.base64_encode(self::STYLESHEET),
            '__CZCIONKA__' => 'data:font/ttf;base64,'.base64_encode((string) File::get($directory.'/DejaVuSerif.ttf')),
        ]);

        try {
            // Zapis jest uszkodzoną regułą: silnik bywa przy nim głośny (uwaga PHP w parserze stylów).
            $result = @$this->generate('<p>Tekst akapitu</p>', [], $head);
            $after = $this->listing($directory);
        } finally {
            foreach (array_diff($this->listing($directory), $before) as $created) {
                File::delete($directory.'/'.$created);
            }
        }

        $this->assertSame($before, $after);
        $this->assertSame(['DejaVuSans'], $result['fonts']);
    }

    /**
     * Reguła to równość całego napisu po rozwiązaniu adresu przez silnik. Co silnik
     * robi z każdym wariantem zapisu DOZWOLONEGO adresu (fakt + asercja):
     *
     * @return array<string, array{0: string, 1: bool, 2: string|null}>
     */
    public static function addressVariants(): array
    {
        return [
            // Reguła dostaje adres z wielkimi literami schematu — to inny napis.
            'schemat wielkimi literami' => ['DATA:__RESZTA__', false, 'adres danych spoza listy'],
            // Adres z białym znakiem na początku silnik traktuje jak ścieżkę pliku i nie
            // umie jej rozwiązać; reguła nie jest nawet pytana.
            'spacja na początku' => [' data:__RESZTA__', false, 'Unable to parse image URL'],
            'tabulator i nowy wiersz na początku' => ["\t\ndata:__RESZTA__", false, 'Unable to parse image URL'],
            // Biały znak na końcu zostaje w adresie — to inny napis.
            'spacja na końcu' => ['data:__RESZTA__ ', false, 'adres danych spoza listy'],
            // Encję dekoduje parser HTML, zanim silnik zobaczy adres: reguła dostaje ten sam
            // napis, który stoi na liście, więc obraz przechodzi. To nie jest obejście —
            // to ten sam adres.
            'encja w środku adresu' => ['data:image&#47;__RESZTA_PO_UKOSNIKU__', true, null],
            'encja w schemacie' => ['&#100;ata:__RESZTA__', true, null],
        ];
    }

    #[DataProvider('addressVariants')]
    public function test_variant_spelling_of_a_listed_address_is_judged_as_the_whole_string(string $variant, bool $drawn, ?string $warning): void
    {
        $address = self::image();
        $rest = substr($address, strlen('data:'));

        $written = strtr($variant, [
            '__RESZTA_PO_UKOSNIKU__' => substr($rest, strlen('image/')),
            '__RESZTA__' => $rest,
        ]);

        $result = $this->generate('<img src="'.$written.'" alt="">', [$address]);

        $this->assertSame($drawn, $result['drawn']);

        if ($warning === null) {
            $this->assertSame([], $result['warnings']);
        } else {
            $this->assertCount(1, $result['warnings']);
            $this->assertStringContainsString($warning, $result['warnings'][0]);
        }
    }

    /**
     * Noga dodatnia: certyfikat z kodem QR z listy rysuje kod; ten sam certyfikat
     * z pustą listą — nie. Dokumenty bez kodu QR powstają przy pustej liście.
     */
    public function test_certificate_draws_the_code_from_the_list_and_documents_without_a_code_need_no_list(): void
    {
        $cases = require base_path('tests/Fixtures/DocumentTemplates/golden-data.php');
        $code = self::image();

        $certificate = $cases['certificate'];
        $certificate['data']['qr_svg'] = $code;
        $html = DocumentTemplateRenderer::fileHtml($certificate['view'], $certificate['data']);

        $listed = $this->generateDocument($html, [$code]);
        $this->assertSame([], $listed['warnings']);
        $this->assertTrue($listed['drawn']);

        $unlisted = $this->generateDocument($html, []);
        $this->assertCount(1, $unlisted['warnings']);
        $this->assertFalse($unlisted['drawn']);

        foreach (['agreement', 'attendance_certificate'] as $type) {
            $document = $this->generateDocument(DocumentTemplateRenderer::fileHtml($cases[$type]['view'], $cases[$type]['data']), []);
            $this->assertSame([], $document['warnings'], $type);
        }
    }

    /**
     * Próbne generowanie wzoru (i przyszły podgląd) przekazuje silnikowi adresy,
     * które serwer sam wstawił do danych przykładowych — i żadnych innych.
     */
    public function test_trial_generation_passes_exactly_the_addresses_of_the_sample_data(): void
    {
        $this->assertSame([], DocumentTemplateSampleData::allowedDataUris('agreement'));
        $this->assertSame([], DocumentTemplateSampleData::allowedDataUris('attendance_certificate'));
        $this->assertSame(
            [DocumentTemplateSampleData::for('certificate')['qr_svg']],
            DocumentTemplateSampleData::allowedDataUris('certificate'),
        );

        foreach (['agreement', 'attendance_certificate', 'certificate'] as $type) {
            $GLOBALS['_dompdf_warnings'] = [];

            $this->assertNull(DocumentTemplateTrial::failure($type, (string) File::get(resource_path('document-templates/'.$type.'.html'))), $type);
            // Wzór domyślny nie dostaje ani jednej odmowy — także kod QR z danych przykładowych.
            $this->assertSame([], (array) $GLOBALS['_dompdf_warnings'], $type);
        }
    }

    /**
     * Odpowiedź na wzór nie zależy od tego, czy plik wskazany w treści istnieje
     * na serwerze: w obu przypadkach zasobu po prostu nie ma w dokumencie.
     *
     * @return array<string, array{0: string}>
     */
    public static function fileReferences(): array
    {
        return [
            'tło w atrybucie style' => ['<p>Numer {{ $number }}</p><div style="background:url(__PLIK__)">x</div>'],
            'tło w bloku style' => ['<style>div { background:url("__PLIK__") }</style><p>Numer {{ $number }}</p><div>x</div>'],
            'tło z adresu file://' => ['<p>Numer {{ $number }}</p><div style="background:url(file://__PLIK__)">x</div>'],
            'obraz' => ['<p>Numer {{ $number }}</p><img src="__PLIK__" alt="">'],
            'arkusz' => ['<link rel="stylesheet" href="__PLIK__"><p>Numer {{ $number }}</p>'],
            'obraz listy' => ['<ul style="list-style-image:url(__PLIK__)"><li>Numer {{ $number }}</li></ul>'],
            'tło z archiwum' => ['<p>Numer {{ $number }}</p><div style="background:url(phar://__PLIK__/tlo.svg)">x</div>'],
        ];
    }

    #[DataProvider('fileReferences')]
    public function test_trial_result_does_not_depend_on_the_file_existing_on_the_server(string $content): void
    {
        // Nazwa z końcówką archiwum, żeby ta sama ścieżka służyła też adresowi `phar://`.
        $file = $this->temporaryDirectory.'/zasob.phar';
        $content = str_replace('__PLIK__', $file, $content);

        $this->assertFileDoesNotExist($file);
        $absent = DocumentTemplateTrial::failure('agreement', $content);

        File::put($file, self::SVG);
        $this->assertFileExists($file);
        $present = DocumentTemplateTrial::failure('agreement', $content);

        $this->assertSame($absent, $present);
        $this->assertNull($present);
    }

    private static function image(): string
    {
        return 'data:image/svg+xml;base64,'.base64_encode(self::SVG);
    }

    /**
     * @return list<string>
     */
    private function listing(string $directory): array
    {
        $files = array_values(array_diff((array) scandir($directory), ['.', '..']));
        sort($files);

        return $files;
    }

    /**
     * @param  list<string>  $allowedDataUris
     * @return array{warnings: list<string>, drawn: bool, fonts: list<string>}
     */
    private function generate(string $body, array $allowedDataUris, string $head = ''): array
    {
        return $this->generateDocument('<html><head>'.$head.'</head><body>'.$body.'</body></html>', $allowedDataUris);
    }

    /**
     * @param  list<string>  $allowedDataUris
     * @return array{warnings: list<string>, drawn: bool, fonts: list<string>}
     */
    private function generateDocument(string $html, array $allowedDataUris): array
    {
        $GLOBALS['_dompdf_warnings'] = [];

        $bytes = (string) PdfService::generated($html, $allowedDataUris)->output(['compress' => 0]);

        $this->assertStringStartsWith('%PDF', $bytes);

        preg_match_all('~/BaseFont\s*/(?:[A-Z]{6}\+)?([A-Za-z0-9-]+)~', $bytes, $fonts);
        $found = array_values(array_unique($fonts[1]));
        sort($found);

        return [
            'warnings' => array_values((array) $GLOBALS['_dompdf_warnings']),
            'drawn' => preg_match(self::COLOUR, $bytes) === 1,
            'fonts' => $found,
        ];
    }
}
