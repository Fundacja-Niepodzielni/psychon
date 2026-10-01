<?php

namespace Tests\Feature\DocumentTemplates;

use App\Models\Document;
use App\Models\DocumentTemplate;
use App\Models\DocumentTemplateVersion;
use App\Models\User;
use App\Services\DocumentTemplates\DocumentTemplateTrial;
use App\Services\DocumentTemplates\DocumentTooCostly;
use App\Services\H14\DocumentIssuer;
use App\Support\PdfService;
use Database\Seeders\DocumentTemplateSeeder;
use ErrorException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Facades\View;
use Illuminate\Support\Str;
use Illuminate\View\FileViewFinder;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;
use Throwable;

/**
 * Wzór, na którym silnik PDF się wywraca albo który przekracza limit wejścia,
 * nie może ani zostać zapisany, ani zatrzymać wydawania dokumentów.
 *
 * Dwie zapory, każda z własnymi próbami:
 *  - ZAPIS: po regule pól dokument jest próbnie generowany z danymi
 *    przykładowymi; błąd silnika albo przekroczony limit to odmowa 422 z jednym
 *    zdaniem przy polu treści i nic nie jest zapisane;
 *  - GENEROWANIE: treść, która mimo to leży w bazie (wstawiona z pominięciem
 *    edytora albo zapisana w innym środowisku), nie kończy się błędem serwera —
 *    dokument powstaje z pliku w repozytorium, a w dzienniku zostaje jeden wpis
 *    bez treści wzoru i bez danych osoby. Błąd w samym pliku repozytorium nie
 *    jest łapany.
 *
 * Przypadkiem wzorcowym błędu silnika jest tło wskazujące adres sieciowy: silnik
 * odnotowuje dla niego odmowę, po czym kończy błędem zamiast pominąć zasób.
 * Adres PLIKU dostaje zawsze czystą odmowę — odpowiedź zapisu nie może zależeć
 * od tego, czy plik istnieje na serwerze. Adres `data:` z treści wzoru nie jest
 * wczytywany (nie ma go na liście adresów generowania), więc zapis przechodzi,
 * a zasobu w dokumencie nie ma.
 *
 * Pliki prób leżą we własnym katalogu tymczasowym testu, zakładanym i usuwanym tutaj.
 *
 * `php artisan test --filter=DocumentTemplateTrialGenerationTest`
 */
class DocumentTemplateTrialGenerationTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    private const string REFUSAL = 'Z tego wzoru nie da się wygenerować dokumentu. Usuń odwołania do plików i adresów; obrazy tylko osadzone w treści.';

    private const string TOO_COSTLY = 'Wzór jest zbyt złożony, żeby wygenerować z niego dokument: ma za dużo elementów, zbyt głębokie zagnieżdżenie, zbyt duże scalenie komórek tabeli albo za dużo stron.';

    /** Treść, na której silnik kończy błędem — niezależnie od tego, co leży na dysku serwera. */
    private const string ENGINE_ERROR = '<div style="background:url(http://example.test/tlo.svg)">x</div>';

    private const string PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    private const string JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

    private string $temporaryDirectory;

    private string $file;

    private string $archive;

    protected function setUp(): void
    {
        parent::setUp();

        $this->temporaryDirectory = storage_path('framework/testing/proba-generowania-'.Str::lower(Str::random(12)));
        File::ensureDirectoryExists($this->temporaryDirectory);

        $this->file = $this->temporaryDirectory.'/tlo-probne.svg';
        File::put($this->file, '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#000"/></svg>');

        // Zwykły plik o nazwie z końcówką archiwum — wystarcza, żeby silnik rozpoznał adres.
        $this->archive = $this->temporaryDirectory.'/archiwum.phar';
        File::put($this->archive, 'to nie jest archiwum');
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->temporaryDirectory);

        parent::tearDown();
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function backgroundContents(): array
    {
        return [
            'tło w atrybucie style, adres http' => ['<p>Numer {{ $number }}</p><div style="background:url(http://example.test/tlo.svg)">x</div>'],
            'tło w bloku style, adres https' => ['<style>div { background:url("https://example.test/tlo.svg") }</style><p>Numer {{ $number }}</p><div>x</div>'],
            'tło w atrybucie style, adres ftp' => ['<p>Numer {{ $number }}</p><div style="background:url(ftp://example.test/tlo.svg)">x</div>'],
        ];
    }

    #[DataProvider('backgroundContents')]
    public function test_saving_a_template_the_engine_cannot_generate_is_refused_and_nothing_is_stored(string $content): void
    {
        $this->seed(DocumentTemplateSeeder::class);
        $this->actingAsRole('super_admin');

        $seeded = DocumentTemplate::query()->where('type', 'agreement')->firstOrFail()->content;
        $auditBefore = DB::table('audit_log')->count();
        $logged = $this->captureLog();

        $response = $this->putJson('/api/v1/document-templates/agreement', ['content' => $content]);

        $response->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');
        $this->assertSame(self::REFUSAL, $response->json('error.errors.content.0'));
        $this->assertCount(1, (array) $response->json('error.errors.content'));

        $this->assertDatabaseHas('document_templates', ['type' => 'agreement', 'version' => 1]);
        $this->assertSame($seeded, DocumentTemplate::query()->where('type', 'agreement')->firstOrFail()->content);
        $this->assertSame(3, DocumentTemplateVersion::query()->count());
        $this->assertSame($auditBefore, DB::table('audit_log')->count());
        $this->assertSame([], $this->linesWith($logged(), ['background', 'example.test']));
    }

    /**
     * Zasób, któremu silnik odmawia bez błędu: zapis przechodzi, dokument powstaje,
     * zasobu w nim nie ma. Nigdy błąd serwera.
     *
     * @return array<string, array{0: string}>
     */
    public static function cleanlyRefusedResources(): array
    {
        return [
            'tło z pliku' => ['<div style="background:url(__PLIK__)">x</div>'],
            'tło z pliku, ścieżka względna' => ['<div style="background:url(__WZGLEDNA__)">x</div>'],
            'tło z pliku w bloku style' => ['<style>div { background:url("__PLIK__") }</style><div>x</div>'],
            'tło z archiwum' => ['<div style="background:url(phar://__ARCHIWUM__/tlo.svg)">x</div>'],
            'obraz ftp' => ['<img src="ftp://example.test/obraz.svg" alt="">'],
            'obraz z archiwum' => ['<img src="phar://__ARCHIWUM__/obraz.svg" alt="">'],
            'arkusz z archiwum' => ['<link rel="stylesheet" href="phar://__ARCHIWUM__/arkusz.css"><p>x</p>'],
            'obraz ze ścieżki pliku' => ['<img src="__PLIK__" alt="">'],
            'obraz PNG osadzony w treści' => ['<img src="'.self::PNG.'" alt="">'],
            'obraz JPEG osadzony w treści' => ['<img src="'.self::JPEG.'" alt="">'],
            'obraz SVG osadzony w treści' => ['<img src="__SVG__" alt="">'],
            'tło PNG osadzone w treści' => ['<div style="width:10px;height:10px;background:url('.self::PNG.')">x</div>'],
            'tło SVG osadzone w treści' => ['<div style="width:10px;height:10px;background:url(__SVG__)">x</div>'],
        ];
    }

    #[DataProvider('cleanlyRefusedResources')]
    public function test_resource_the_engine_refuses_cleanly_is_saved_and_left_out_of_the_document(string $content): void
    {
        $this->seed(DocumentTemplateSeeder::class);
        $this->actingAsRole('project_manager');

        $response = $this->putJson('/api/v1/document-templates/agreement', ['content' => '<p>Numer {{ $number }}</p>'.$this->withPaths($content)]);

        $this->assertNotSame(500, $response->status());
        $response->assertOk()->assertJsonPath('data.version', 2)->assertJsonPath('data.current_version_unused', false);

        // Dokument z tego wzoru powstaje z TREŚCI Z BAZY, a zasób jest pominięty z odmową silnika.
        $logged = $this->captureLog();
        $GLOBALS['_dompdf_warnings'] = [];

        $bytes = PdfService::renderBytes('documents.volunteer-agreement', $this->goldenData());

        $this->assertStringStartsWith('%PDF', $bytes);
        $this->assertCount(1, (array) $GLOBALS['_dompdf_warnings']);
        $this->assertStringContainsString(PdfService::REFUSAL, (string) $GLOBALS['_dompdf_warnings'][0]);
        $this->assertSame([], $this->errors($logged()));
    }

    /**
     * Odpowiedź zapisu (kod i treść) nie zależy od tego, czy plik wskazany we wzorze
     * istnieje na serwerze — inaczej zapisem dałoby się sprawdzać, co leży na dysku.
     *
     * Ta sama treść jest zapisywana dwa razy: raz, gdy pliku nie ma, i raz, gdy jest.
     * Między zapisami próba cofa wzór do stanu wyjściowego (w transakcji testu) i
     * trzyma zegar w miejscu, żeby oba zapisy były tym samym zapisem.
     *
     * @return array<string, array{0: string}>
     */
    public static function fileReferences(): array
    {
        return [
            'tło w atrybucie style' => ['<p>Numer {{ $number }}</p><div style="background:url(__MOZE__)">x</div>'],
            'tło w bloku style' => ['<style>div { background:url("__MOZE__") }</style><p>Numer {{ $number }}</p><div>x</div>'],
            'tło z adresu file://' => ['<p>Numer {{ $number }}</p><div style="background:url(file://__MOZE__)">x</div>'],
            'tło z archiwum' => ['<p>Numer {{ $number }}</p><div style="background:url(phar://__MOZE__/tlo.svg)">x</div>'],
            'obraz' => ['<p>Numer {{ $number }}</p><img src="__MOZE__" alt="">'],
        ];
    }

    #[DataProvider('fileReferences')]
    public function test_save_response_does_not_depend_on_the_file_existing_on_the_server(string $content): void
    {
        $this->seed(DocumentTemplateSeeder::class);
        $this->actingAsRole('super_admin');
        $this->freezeTime();

        $maybe = $this->temporaryDirectory.'/moze-istniec.phar';
        $content = str_replace('__MOZE__', $maybe, $content);
        $seeded = DocumentTemplate::query()->where('type', 'agreement')->firstOrFail()->content;

        $this->assertFileDoesNotExist($maybe);
        $absent = $this->putJson('/api/v1/document-templates/agreement', ['content' => $content]);

        // Stan wyjściowy: wersja 1 z zasilenia, bez wiersza historii z pierwszego zapisu.
        DocumentTemplateVersion::query()->where('type', 'agreement')->where('version', '>', 1)->delete();
        DocumentTemplate::query()->where('type', 'agreement')->update(['content' => $seeded, 'version' => 1]);

        File::put($maybe, '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#000"/></svg>');
        $this->assertFileExists($maybe);
        $present = $this->putJson('/api/v1/document-templates/agreement', ['content' => $content]);

        $this->assertSame($absent->status(), $present->status());
        $this->assertSame($absent->json(), $present->json());
        $this->assertSame(200, $present->status());
        $this->assertSame(2, $present->json('data.version'));
    }

    /**
     * Wejście tanie w zapisie i drogie w generowaniu: odmowa z własnym zdaniem, nic nie zapisane.
     *
     * @return array<string, array{0: string}>
     */
    public static function costlyContents(): array
    {
        return [
            'tysiąc zagnieżdżonych tabel' => [str_repeat('<table><tr><td>', 1000)],
            'scalenie komórek ponad limit' => ['<table><tr><td colspan="51" rowspan="2">x</td></tr></table>'],
            '450 wymuszonych stron' => [str_repeat('<div style="page-break-after:always"></div>', 450).'<div style="height:100000cm">x</div>'],
        ];
    }

    #[DataProvider('costlyContents')]
    public function test_saving_a_template_over_the_generation_limit_is_refused_within_two_seconds(string $content): void
    {
        $this->seed(DocumentTemplateSeeder::class);
        $this->actingAsRole('super_admin');

        $started = hrtime(true);
        $response = $this->putJson('/api/v1/document-templates/agreement', ['content' => $content]);
        $seconds = (hrtime(true) - $started) / 1e9;

        $response->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');
        $this->assertSame(self::TOO_COSTLY, $response->json('error.errors.content.0'));
        $this->assertSame(self::TOO_COSTLY, DocumentTemplateTrial::TOO_COSTLY_MESSAGE);
        $this->assertLessThan(2.0, $seconds);
        $this->assertDatabaseHas('document_templates', ['type' => 'agreement', 'version' => 1]);
        $this->assertSame(3, DocumentTemplateVersion::query()->count());
    }

    /**
     * Treść wstawiona wprost do bazy, z pominięciem trasy zapisu: pobranie
     * dokumentu osoby dalej działa, dokument powstaje z pliku w repozytorium.
     *
     * @return array<string, array{0: string, 1: class-string<Throwable>}>
     */
    public static function storedContentsTheGeneratorGivesUpOn(): array
    {
        return [
            'błąd silnika' => [self::ENGINE_ERROR, ErrorException::class],
            'przekroczony limit wejścia' => [str_repeat('<table><tr><td>', 1000), DocumentTooCostly::class],
        ];
    }

    /**
     * @param  class-string<Throwable>  $exception
     */
    #[DataProvider('storedContentsTheGeneratorGivesUpOn')]
    public function test_template_in_the_database_that_cannot_be_generated_gives_the_document_from_the_file_and_one_log_entry(string $content, string $exception): void
    {
        $this->seed();

        $document = Document::query()->where('type', 'volunteer_agreement')->firstOrFail();
        $owner = User::query()->findOrFail($document->user_id);
        $this->assertSame('documents.volunteer-agreement', DocumentIssuer::viewFor($document->type));

        // Migawka w pełnym kształcie (sztuczne dane próby), żeby było czego szukać w dzienniku.
        $snapshot = $this->goldenData();
        $document->update(['data_snapshot' => $snapshot]);

        DocumentTemplate::query()->updateOrCreate(['type' => 'agreement'], [
            'content' => '<style>p { font-family: "DejaVu Serif"; }</style><p>tajny-tekst-wzoru {{ $first_name }} {{ $pesel }}</p>'.$content,
            'version' => 7,
            'updated_by' => null,
        ]);

        $this->actingAs($owner, 'keycloak');
        $logged = $this->captureLog();

        $response = $this->get(URL::temporarySignedRoute('documents.download', now()->addMinutes(15), ['document' => $document->public_id]));

        $response->assertOk();
        $bytes = (string) $response->getContent();
        $this->assertStringStartsWith('%PDF', $bytes);

        // Dokument z pliku w repozytorium: jego czcionki, a nie czcionka z treści w bazie.
        $this->assertSame(['Helvetica', 'Helvetica-Bold'], $this->fonts($bytes));

        // Dokładnie jeden wpis w dzienniku błędów: rodzaj, wersja, klasa wyjątku — nic więcej.
        $errors = $this->errors($logged());
        $this->assertCount(1, $errors);
        $this->assertSame(
            ['type' => 'agreement', 'version' => 7, 'exception' => $exception],
            $errors[0]['context'],
        );

        $line = $errors[0]['message'].' '.json_encode($errors[0]['context'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $forbidden = ['tajny-tekst-wzoru', 'example.test', 'background', '<table', 'Undefined array key', 'storage'];

        foreach ($snapshot as $value) {
            if (is_scalar($value) && mb_strlen((string) $value) >= 3) {
                $forbidden[] = (string) $value;
            }
        }

        $this->assertGreaterThan(8, count($forbidden), 'Migawka dokumentu musi nieść dane osoby, inaczej próba niczego nie mierzy.');

        foreach ($forbidden as $needle) {
            $this->assertStringNotContainsString($needle, $line);
        }
    }

    /**
     * Błąd w pliku z repozytorium ma być widoczny — siatka stoi wyłącznie wokół
     * treści z bazy. Zepsuty wzór-plik jest podstawiany z katalogu tymczasowego
     * testu (pierwsze miejsce wyszukiwania widoków), bez zmiany plików śledzonych.
     */
    public function test_error_in_the_repository_template_file_is_not_swallowed(): void
    {
        File::ensureDirectoryExists($this->temporaryDirectory.'/widoki/documents');
        File::put(
            $this->temporaryDirectory.'/widoki/documents/volunteer-agreement.php',
            "<?php throw new RuntimeException('zepsuty-wzor-z-pliku');",
        );
        $finder = View::getFinder();
        $this->assertInstanceOf(FileViewFinder::class, $finder);
        $finder->prependLocation($this->temporaryDirectory.'/widoki');
        $finder->flush();

        // Bez wiersza w bazie: dokument idzie z pliku i błąd pliku wychodzi na wierzch.
        $this->assertStringContainsString('zepsuty-wzor-z-pliku', $this->failureOf(
            fn (): string => PdfService::renderBytes('documents.volunteer-agreement', $this->goldenData()),
        ));

        // Z wierszem, na którym silnik się wywraca: siatka przechodzi na plik — i błąd pliku też wychodzi.
        DocumentTemplate::create([
            'type' => 'agreement',
            'content' => self::ENGINE_ERROR,
            'version' => 2,
            'updated_by' => null,
        ]);
        $logged = $this->captureLog();

        $this->assertStringContainsString('zepsuty-wzor-z-pliku', $this->failureOf(
            fn (): string => PdfService::renderBytes('documents.volunteer-agreement', $this->goldenData()),
        ));
        $this->assertCount(1, $this->errors($logged()));
    }

    /**
     * Próbne generowanie stoi ZA limitem żądań trasy zapisu: po wyczerpaniu limitu
     * kolejne żądanie dostaje 429 i silnik nie jest już uruchamiany.
     */
    public function test_request_limit_of_the_save_route_covers_trial_generation(): void
    {
        $this->seed(DocumentTemplateSeeder::class);
        $this->actingAsRole('super_admin');

        // Dwadzieścia żądań mieści się w limicie. Jaką odpowiedź dostaje taka treść,
        // mierzą próby wyżej — tutaj liczy się wyłącznie to, że nie jest to jeszcze 429.
        for ($attempt = 1; $attempt <= 20; $attempt++) {
            $status = $this->putJson('/api/v1/document-templates/agreement', ['content' => self::ENGINE_ERROR])->status();
            $this->assertNotSame(429, $status, 'Żądanie nr '.$attempt.' zmieściło się w limicie.');
            $this->assertNotSame(500, $status);
        }

        $versionsBefore = DocumentTemplateVersion::query()->count();

        $this->putJson('/api/v1/document-templates/agreement', ['content' => self::ENGINE_ERROR])
            ->assertStatus(429)
            ->assertJsonPath('error.code', 'too_many_requests');

        // Limit dotyczy trasy zapisu, nie treści: poprawny wzór też czeka.
        $this->putJson('/api/v1/document-templates/agreement', ['content' => '<p>Numer {{ $number }}</p>'])
            ->assertStatus(429);

        $this->assertSame($versionsBefore, DocumentTemplateVersion::query()->count());

        // Odczyt wzoru nie jest objęty tym limitem.
        $this->getJson('/api/v1/document-templates/agreement')->assertOk();
    }

    private function withPaths(string $content): string
    {
        $workingDirectory = (string) getcwd();
        $this->assertStringStartsWith($workingDirectory, $this->file, 'Katalog tymczasowy testu musi leżeć pod katalogiem roboczym procesu.');
        $relative = ltrim(str_replace(DIRECTORY_SEPARATOR, '/', substr($this->file, strlen($workingDirectory))), '/');

        return strtr($content, [
            '__PLIK__' => $this->file,
            '__WZGLEDNA__' => $relative,
            '__ARCHIWUM__' => $this->archive,
            '__SVG__' => 'data:image/svg+xml;base64,'.base64_encode((string) File::get($this->file)),
        ]);
    }

    /**
     * @return callable(): list<array{level: string, message: string, context: array<string, mixed>}>
     */
    private function captureLog(): callable
    {
        $logged = [];

        Event::listen(MessageLogged::class, function (MessageLogged $event) use (&$logged): void {
            $logged[] = ['level' => $event->level, 'message' => $event->message, 'context' => $event->context];
        });

        return static function () use (&$logged): array {
            return $logged;
        };
    }

    /**
     * @param  list<array{level: string, message: string, context: array<string, mixed>}>  $logged
     * @return list<array{level: string, message: string, context: array<string, mixed>}>
     */
    private function errors(array $logged): array
    {
        return array_values(array_filter($logged, static fn (array $entry): bool => $entry['level'] === 'error'));
    }

    /**
     * @param  list<array{level: string, message: string, context: array<string, mixed>}>  $logged
     * @param  list<string>  $needles
     * @return list<string>
     */
    private function linesWith(array $logged, array $needles): array
    {
        $lines = array_map(static fn (array $entry): string => $entry['message'].' '.json_encode($entry['context']), $logged);

        return array_values(array_filter($lines, static fn (string $line): bool => Str::contains($line, $needles)));
    }

    /**
     * @param  callable(): string  $generate
     */
    private function failureOf(callable $generate): string
    {
        try {
            $generate();
        } catch (Throwable $exception) {
            return $exception->getMessage();
        }

        $this->fail('Generowanie z zepsutego pliku wzoru nie zgłosiło błędu.');
    }

    /**
     * @return list<string>
     */
    private function fonts(string $bytes): array
    {
        preg_match_all('~/BaseFont\s*/(?:[A-Z]{6}\+)?([A-Za-z0-9-]+)~', $bytes, $fonts);
        $found = array_values(array_unique($fonts[1]));
        sort($found);

        return $found;
    }

    /**
     * @return array<string, mixed>
     */
    private function goldenData(): array
    {
        return (require base_path('tests/Fixtures/DocumentTemplates/golden-data.php'))['agreement']['data'];
    }
}
