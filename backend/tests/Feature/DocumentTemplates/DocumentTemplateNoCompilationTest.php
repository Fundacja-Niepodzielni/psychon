<?php

namespace Tests\Feature\DocumentTemplates;

use App\Models\DocumentTemplate;
use App\Models\DocumentTemplateVersion;
use App\Services\DocumentTemplates\DocumentTemplateRenderer;
use App\Support\PdfService;
use Database\Seeders\DocumentTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * Treść wzoru dokumentu z bazy nie jest kompilowana ani wykonywana, a silnik PDF
 * nie czyta z dysku niczego spoza ramy dokumentu.
 *
 * Próby wykonania kodu używają ZNACZNIKA: pliku we własnym katalogu tymczasowym
 * testu (`storage/framework/testing/…`, zakładanym i usuwanym tutaj). Treść,
 * która po skompilowaniu jako szablon utworzyłaby ten plik, nie może go utworzyć
 * — ani przez zapis w edytorze (odmowa 422, nic nie zapisane), ani jako wiersz,
 * który już leży w bazie (generator bierze wtedy wzór z pliku w repozytorium).
 *
 * Katalog tymczasowy leży celowo WEWNĄTRZ katalogu zaplecza, a poza ramą
 * dokumentu: silnik zamknięty w całym katalogu zaplecza osadziłby z niego plik,
 * silnik zamknięty w ramie — nie.
 *
 * `php artisan test --filter=DocumentTemplateNoCompilationTest`
 */
class DocumentTemplateNoCompilationTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    private string $temporaryDirectory;

    private string $marker;

    protected function setUp(): void
    {
        parent::setUp();

        $this->temporaryDirectory = storage_path('framework/testing/wzor-bez-kompilacji-'.Str::lower(Str::random(12)));
        File::ensureDirectoryExists($this->temporaryDirectory);
        $this->marker = $this->temporaryDirectory.'/znacznik-wykonania';
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->temporaryDirectory);

        parent::tearDown();
    }

    /**
     * Cztery klasy treści, z których każda — skompilowana jako szablon —
     * utworzyłaby plik-znacznik.
     *
     * @return array<string, array{0: string}>
     */
    public static function executableContents(): array
    {
        return [
            'dyrektywa wykonująca kod' => ["<p>@php file_put_contents('__ZNACZNIK__', 'x'); @endphp</p>"],
            'wyrażenie wywołujące funkcję' => ["<p>{{ file_put_contents('__ZNACZNIK__', 'x') }}</p>"],
            'wypisanie bez zamiany znaków' => ["<p>{!! file_put_contents('__ZNACZNIK__', 'x') !!}</p>"],
            'znacznik PHP' => ["<p><?php file_put_contents('__ZNACZNIK__', 'x'); ?></p>"],
        ];
    }

    #[DataProvider('executableContents')]
    public function test_saving_executable_content_is_refused_and_nothing_is_stored_logged_or_executed(string $content): void
    {
        $this->seed(DocumentTemplateSeeder::class);
        $this->actingAsRole('super_admin');

        $content = str_replace('__ZNACZNIK__', $this->marker, $content);
        $seeded = DocumentTemplate::query()->where('type', 'agreement')->firstOrFail()->content;
        $auditBefore = DB::table('audit_log')->count();

        $logged = [];
        Event::listen(MessageLogged::class, function (MessageLogged $event) use (&$logged): void {
            $logged[] = $event->message.' '.json_encode($event->context);
        });

        $response = $this->putJson('/api/v1/document-templates/agreement', ['content' => $content]);

        $response->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');

        $message = (string) $response->json('error.errors.content.0');
        $this->assertStringContainsString('Wolno wstawić wyłącznie pola z listy tego dokumentu', $message);
        $this->assertStringNotContainsString('file_put_contents', $message);

        // Nic nie zapisane: ani wzór, ani wersja, ani wpis audytu.
        $this->assertDatabaseHas('document_templates', ['type' => 'agreement', 'version' => 1]);
        $this->assertSame($seeded, DocumentTemplate::query()->where('type', 'agreement')->firstOrFail()->content);
        $this->assertSame(3, DocumentTemplateVersion::query()->count());
        $this->assertSame($auditBefore, DB::table('audit_log')->count());

        // Treść wzoru nie trafia do dziennika aplikacji.
        $this->assertSame([], array_values(array_filter(
            $logged,
            static fn (string $line): bool => str_contains($line, 'file_put_contents') || str_contains($line, 'znacznik-wykonania'),
        )));

        // I nic się nie wykonało — ani przy zapisie, ani przy generowaniu po nim.
        $case = $this->goldenCase('agreement');
        $this->assertSame($this->golden('agreement'), DocumentTemplateRenderer::html($case['view'], $case['data']));
        $this->assertFileDoesNotExist($this->marker);
    }

    #[DataProvider('executableContents')]
    public function test_executable_content_already_in_the_database_is_neither_executed_nor_printed(string $content): void
    {
        $content = str_replace('__ZNACZNIK__', $this->marker, $content);

        // Stara wersja: wiersz wstawiony wprost do bazy, z pominięciem edytora.
        $template = DocumentTemplate::create(['type' => 'agreement', 'content' => $content, 'version' => 2, 'updated_by' => null]);
        DocumentTemplateVersion::create([
            'document_template_id' => $template->id,
            'type' => 'agreement',
            'content' => $content,
            'version' => 2,
            'updated_by' => null,
        ]);

        $case = $this->goldenCase('agreement');

        $html = DocumentTemplateRenderer::html($case['view'], $case['data']);
        $bytes = PdfService::renderBytes($case['view'], $case['data']);

        $this->assertFileDoesNotExist($this->marker);
        // Dokument wygenerowany z pliku w repozytorium, bez śladu treści z bazy.
        $this->assertSame($this->golden('agreement'), $html);
        $this->assertStringNotContainsString('file_put_contents', $html);
        $this->assertStringStartsWith('%PDF', $bytes);
    }

    public function test_row_seeded_before_the_rule_with_template_syntax_still_gives_the_same_document(): void
    {
        // Tak wyglądają wiersze zasilone przed tą zmianą: plik widoku skopiowany bajt w bajt.
        foreach (['agreement' => 'documents/volunteer-agreement', 'attendance_certificate' => 'documents/internship-certificate', 'certificate' => 'pdf/certificate'] as $type => $file) {
            DocumentTemplate::create([
                'type' => $type,
                'content' => File::get(resource_path('views/'.$file.'.blade.php')),
                'version' => 1,
                'updated_by' => null,
            ]);
        }

        foreach (DocumentTemplate::TYPES as $type) {
            $case = $this->goldenCase($type);

            $this->assertSame($this->golden($type), DocumentTemplateRenderer::html($case['view'], $case['data']));
        }
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function types(): array
    {
        return ['agreement' => ['agreement'], 'attendance_certificate' => ['attendance_certificate'], 'certificate' => ['certificate']];
    }

    #[DataProvider('types')]
    public function test_seeded_template_gives_the_document_byte_identical_to_the_one_before_the_change(string $type): void
    {
        $case = $this->goldenCase($type);

        // Bez wiersza: wzór z pliku.
        $this->assertSame($this->golden($type), DocumentTemplateRenderer::html($case['view'], $case['data']));

        $this->seed(DocumentTemplateSeeder::class);

        // Z wierszem z ziarna: pola podstawione zwykłą zamianą tekstu.
        $this->assertSame($this->golden($type), DocumentTemplateRenderer::html($case['view'], $case['data']));
    }

    /**
     * ZNANA RÓŻNICA, zapisana wprost: pole `number` ma jedną wartość domyślną („—").
     * Plik widoku miał dwie — pustą w tytule i „—" w treści. Dla danych BEZ numeru
     * dokument z wiersza z ziarna różni się więc od dokumentu z pliku dokładnie
     * tytułem. Wydawane dokumenty numer mają zawsze.
     */
    public function test_known_difference_without_a_number_the_title_gets_a_dash_instead_of_nothing(): void
    {
        $case = $this->goldenCase('agreement');
        unset($case['data']['number']);

        $fromFile = DocumentTemplateRenderer::html($case['view'], $case['data']);

        $this->seed(DocumentTemplateSeeder::class);

        $fromDatabase = DocumentTemplateRenderer::html($case['view'], $case['data']);

        $this->assertStringContainsString('<title>Porozumienie wolontariackie </title>', $fromFile);
        $this->assertStringContainsString('<title>Porozumienie wolontariackie —</title>', $fromDatabase);
        $this->assertSame(
            str_replace('<title>Porozumienie wolontariackie </title>', '<title>Porozumienie wolontariackie —</title>', $fromFile),
            $fromDatabase,
        );
    }

    public function test_stored_content_with_an_unknown_field_gives_the_document_from_the_file_and_stays_out_of_the_log(): void
    {
        DocumentTemplate::create([
            'type' => 'agreement',
            'content' => '<p>tajny-tekst-wzoru {{ $password }}</p>',
            'version' => 2,
            'updated_by' => null,
        ]);

        $logged = [];
        Event::listen(MessageLogged::class, function (MessageLogged $event) use (&$logged): void {
            $logged[] = $event->message.' '.json_encode($event->context);
        });

        $case = $this->goldenCase('agreement');
        $html = DocumentTemplateRenderer::html($case['view'], $case['data']);

        $this->assertSame($this->golden('agreement'), $html);
        $this->assertStringStartsWith('%PDF', PdfService::renderBytes($case['view'], $case['data']));
        $this->assertSame([], array_values(array_filter(
            $logged,
            static fn (string $line): bool => str_contains($line, 'tajny-tekst-wzoru') || str_contains($line, 'password'),
        )));
    }

    public function test_reading_a_template_says_whether_its_current_version_is_unused(): void
    {
        $this->actingAsRole('project_manager');

        // Stary zapis: plik widoku skopiowany do bazy bajt w bajt.
        DocumentTemplate::create([
            'type' => 'agreement',
            'content' => File::get(resource_path('views/documents/volunteer-agreement.blade.php')),
            'version' => 1,
            'updated_by' => null,
        ]);
        // Zapis pól: wiersz taki, jaki zakłada ziarno.
        DocumentTemplate::create([
            'type' => 'certificate',
            'content' => File::get(resource_path('document-templates/certificate.html')),
            'version' => 1,
            'updated_by' => null,
        ]);

        $this->getJson('/api/v1/document-templates/agreement')
            ->assertOk()
            ->assertJsonPath('data.current_version_unused', true);
        $this->getJson('/api/v1/document-templates/certificate')
            ->assertOk()
            ->assertJsonPath('data.current_version_unused', false);

        // Zapis w zapisie pól zdejmuje znacznik — i w odpowiedzi zapisu, i w odczycie.
        $this->putJson('/api/v1/document-templates/agreement', ['content' => '<p>Numer {{ $number }}</p>'])
            ->assertOk()
            ->assertJsonPath('data.current_version_unused', false);
        $this->getJson('/api/v1/document-templates/agreement')
            ->assertOk()
            ->assertJsonPath('data.current_version_unused', false);
    }

    /**
     * Znacznik odczytu i wybór generatora to jeden warunek: dla każdej treści
     * znacznik jest prawdziwy dokładnie wtedy, gdy dokument powstaje z pliku.
     */
    public function test_unused_flag_is_true_exactly_when_the_generator_takes_the_file(): void
    {
        $this->actingAsRole('super_admin');
        $case = $this->goldenCase('agreement');

        $contents = [
            'stary zapis' => File::get(resource_path('views/documents/volunteer-agreement.blade.php')),
            'nieznane pole' => '<p>inny-dokument {{ $password }}</p>',
            'zapis pól' => '<p>inny-dokument {{ $number }}</p>',
            'sam tekst' => '<p>inny-dokument</p>',
        ];

        $template = DocumentTemplate::create(['type' => 'agreement', 'content' => 'x', 'version' => 1, 'updated_by' => null]);

        foreach ($contents as $name => $content) {
            $template->forceFill(['content' => $content])->save();

            $unused = $this->getJson('/api/v1/document-templates/agreement')->assertOk()->json('data.current_version_unused');
            $fromFile = DocumentTemplateRenderer::html($case['view'], $case['data']) === $this->golden('agreement');

            $this->assertIsBool($unused, $name);
            $this->assertSame($fromFile, $unused, $name);
        }
    }

    public function test_saving_the_old_notation_unchanged_is_refused_with_a_reason_in_plain_polish(): void
    {
        $this->actingAsRole('super_admin');

        $old = File::get(resource_path('views/documents/volunteer-agreement.blade.php'));
        $template = DocumentTemplate::create(['type' => 'agreement', 'content' => $old, 'version' => 1, 'updated_by' => null]);
        DocumentTemplateVersion::create([
            'document_template_id' => $template->id,
            'type' => 'agreement',
            'content' => $old,
            'version' => 1,
            'updated_by' => null,
        ]);
        $auditBefore = DB::table('audit_log')->count();

        $logged = [];
        Event::listen(MessageLogged::class, function (MessageLogged $event) use (&$logged): void {
            $logged[] = $event->message.' '.json_encode($event->context);
        });

        $response = $this->putJson('/api/v1/document-templates/agreement', ['content' => $old]);

        $response->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');

        $message = (string) $response->json('error.errors.content.0');
        $this->assertStringContainsString('Wolno wstawić wyłącznie pola z listy tego dokumentu', $message);
        $this->assertStringContainsString('number, edition_name', $message);
        $this->assertDoesNotMatchRegularExpression('/blade|php|dompdf|szablon/i', $message);

        $this->assertDatabaseHas('document_templates', ['type' => 'agreement', 'version' => 1]);
        $this->assertSame(1, DocumentTemplateVersion::query()->count());
        $this->assertSame($auditBefore, DB::table('audit_log')->count());
        $this->assertSame([], array_values(array_filter(
            $logged,
            static fn (string $line): bool => str_contains($line, 'Porozumienie') || str_contains($line, 'edition_name'),
        )));
    }

    public function test_content_limit_counts_characters_not_bytes(): void
    {
        $this->seed(DocumentTemplateSeeder::class);
        $this->actingAsRole('super_admin');

        $atLimit = str_repeat('ż', 20000);
        $this->assertSame(40000, strlen($atLimit));

        $this->putJson('/api/v1/document-templates/agreement', ['content' => $atLimit])
            ->assertOk()
            ->assertJsonPath('data.version', 2);
        $this->assertSame(20000, mb_strlen(DocumentTemplate::query()->where('type', 'agreement')->firstOrFail()->content));

        $response = $this->putJson('/api/v1/document-templates/agreement', ['content' => $atLimit.'ż']);

        $response->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');
        $this->assertSame('Treść wzoru może mieć najwyżej 20 000 znaków.', $response->json('error.errors.content.0'));
        $this->assertDatabaseHas('document_templates', ['type' => 'agreement', 'version' => 2]);
        $this->assertSame(4, DocumentTemplateVersion::query()->count());
    }

    public function test_email_address_passes_and_a_css_at_rule_is_refused(): void
    {
        $this->seed(DocumentTemplateSeeder::class);
        $this->actingAsRole('project_manager');

        $this->putJson('/api/v1/document-templates/agreement', [
            'content' => '<p>Kontakt: biuro@example.test. Numer {{ $number }}.</p>',
        ])->assertOk()->assertJsonPath('data.version', 2);

        $response = $this->putJson('/api/v1/document-templates/agreement', [
            'content' => '<style>@page { margin: 0; }</style><p>Numer {{ $number }}.</p>',
        ]);

        $response->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');
        $this->assertStringContainsString('znaku „@”', (string) $response->json('error.errors.content.0'));
        $this->assertDatabaseHas('document_templates', ['type' => 'agreement', 'version' => 2]);

        $response = $this->putJson('/api/v1/document-templates/agreement', ['content' => '<p>{{ $hours_accepted }}</p>']);

        $response->assertStatus(422);
        $this->assertStringContainsString('Pole „hours_accepted” nie istnieje w tym dokumencie', (string) $response->json('error.errors.content.0'));
        $this->assertSame(4, DocumentTemplateVersion::query()->count());
    }

    public function test_pdf_engine_is_closed_in_the_document_frame(): void
    {
        // Ustawienia czytane z silnika, którym generowany jest każdy dokument.
        $options = PdfService::engine()->getOptions();

        $this->assertSame([realpath(resource_path('pdf-frame'))], $options->getChroot());
        $this->assertSame(['.gitkeep'], array_values(array_diff((array) scandir(resource_path('pdf-frame')), ['.', '..'])));
        $this->assertFalse($options->isRemoteEnabled());
        $this->assertFalse($options->isPhpEnabled());
        $this->assertFalse($options->isJavascriptEnabled());
        $this->assertSame(['data://'], array_keys($options->getAllowedProtocols()));
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function localResourceAddresses(): array
    {
        return [
            'ścieżka pliku spoza ramy' => ['__PLIK__'],
            'adres file://' => ['file://__PLIK__'],
        ];
    }

    /**
     * Miara: ostrzeżenie silnika o odmowie dla tego zasobu. Silnik, który plik
     * osadza, ostrzeżenia nie zapisuje — wtedy ta próba jest czerwona.
     */
    #[DataProvider('localResourceAddresses')]
    public function test_local_file_outside_the_frame_is_not_embedded(string $address): void
    {
        $file = $this->temporaryDirectory.'/znacznik-zasobu.svg';
        File::put($file, '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#000"/></svg>');

        $warnings = $this->engineWarnings('<html><body><p>Zasób</p><img src="'.str_replace('__PLIK__', $file, $address).'" alt=""></body></html>');

        $this->assertCount(1, $warnings);
        $this->assertStringContainsString('Permission denied', $warnings[0]);
        $this->assertStringContainsString('znacznik-zasobu.svg', $warnings[0]);
    }

    public function test_inline_data_image_is_still_embedded(): void
    {
        $svg = 'data:image/svg+xml;base64,'.base64_encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#000"/></svg>');

        $this->assertSame([], $this->engineWarnings('<html><body><img src="'.$svg.'" alt=""></body></html>'));
    }

    /**
     * Fakt o czcionkach, zapisany pomiarem: certyfikat wybiera rodzinę DejaVu, a
     * porozumienie i zaświadczenie — `sans-serif`, czyli czcionkę rdzeniową
     * silnika. Zamknięcie silnika w ramie tego nie zmienia: czcionki wbudowane
     * silnik czyta własną ścieżką, nie przez katalog ramy.
     *
     * @return array<string, array{0: string, 1: list<string>}>
     */
    public static function fontsByType(): array
    {
        return [
            'agreement' => ['agreement', ['Helvetica', 'Helvetica-Bold']],
            'attendance_certificate' => ['attendance_certificate', ['Helvetica', 'Helvetica-Bold']],
            'certificate' => ['certificate', ['DejaVuSans', 'DejaVuSerif', 'DejaVuSerif-Bold']],
        ];
    }

    /**
     * @param  list<string>  $expectedFonts
     */
    #[DataProvider('fontsByType')]
    public function test_three_documents_render_to_pdf_inside_the_frame_with_the_same_fonts_as_before(string $type, array $expectedFonts): void
    {
        $this->seed(DocumentTemplateSeeder::class);
        $case = $this->goldenCase($type);

        $GLOBALS['_dompdf_warnings'] = [];
        $bytes = PdfService::renderBytes($case['view'], $case['data']);

        $this->assertStringStartsWith('%PDF', $bytes);
        $this->assertSame([], $GLOBALS['_dompdf_warnings']);

        preg_match_all('~/BaseFont\s*/(?:[A-Z]{6}\+)?([A-Za-z0-9-]+)~', $bytes, $fonts);
        $found = array_values(array_unique($fonts[1]));
        sort($found);

        $this->assertSame($expectedFonts, $found);
    }

    /**
     * @return list<string>
     */
    private function engineWarnings(string $html): array
    {
        $GLOBALS['_dompdf_warnings'] = [];

        $bytes = PdfService::bytesFromHtml($html);

        $this->assertStringStartsWith('%PDF', $bytes);

        return array_values((array) $GLOBALS['_dompdf_warnings']);
    }

    /**
     * @return array{view: string, data: array<string, mixed>}
     */
    private function goldenCase(string $type): array
    {
        return (require base_path('tests/Fixtures/DocumentTemplates/golden-data.php'))[$type];
    }

    private function golden(string $type): string
    {
        return File::get(base_path('tests/Fixtures/DocumentTemplates/golden/'.$type.'.html'));
    }
}
