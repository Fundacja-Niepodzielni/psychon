<?php

namespace Tests\Feature\DocumentTemplates;

use App\Models\Document;
use App\Models\DocumentTemplate;
use App\Models\DocumentTemplateVersion;
use App\Models\User;
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
 * Wzór, na którym silnik PDF się wywraca, nie może ani zostać zapisany, ani
 * zatrzymać wydawania dokumentów.
 *
 * Dwie zapory, każda z własnymi próbami:
 *  - ZAPIS: po regule pól dokument jest próbnie generowany z danymi
 *    przykładowymi; błąd silnika to odmowa 422 z jednym zdaniem przy polu treści
 *    i nic nie jest zapisane;
 *  - GENEROWANIE: treść, która mimo to leży w bazie (wstawiona z pominięciem
 *    edytora albo zapisana w innym środowisku), nie kończy się błędem serwera —
 *    dokument powstaje z pliku w repozytorium, a w dzienniku zostaje jeden wpis
 *    bez treści wzoru i bez danych osoby. Błąd w samym pliku repozytorium nie
 *    jest łapany.
 *
 * Przypadkiem wzorcowym jest tło wskazujące plik albo adres: silnik zamknięty w
 * ramie odnotowuje dla niego odmowę, po czym kończy błędem zamiast pominąć zasób.
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

    private const string PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

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
            'tło w atrybucie style, ścieżka bezwzględna' => ['<p>Numer {{ $number }}</p><div style="background:url(__PLIK__)">x</div>'],
            'tło w atrybucie style, ścieżka względna' => ['<p>Numer {{ $number }}</p><div style="background:url(__WZGLEDNA__)">x</div>'],
            'tło w atrybucie style, adres http' => ['<p>Numer {{ $number }}</p><div style="background:url(http://example.test/tlo.svg)">x</div>'],
            'tło w bloku style' => ['<style>div { background:url("__PLIK__") }</style><p>Numer {{ $number }}</p><div>x</div>'],
        ];
    }

    #[DataProvider('backgroundContents')]
    public function test_saving_a_template_the_engine_cannot_generate_is_refused_and_nothing_is_stored(string $content): void
    {
        $this->seed(DocumentTemplateSeeder::class);
        $this->actingAsRole('super_admin');

        $content = $this->withPaths($content);
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
        $this->assertSame([], $this->linesWith($logged(), ['tlo-probne', 'background', 'example.test']));
    }

    /**
     * Schemat spoza listy protokołów: albo odmowa zapisu (tło — silnik kończy
     * błędem), albo czysta odmowa silnika (obraz i arkusz — zasób pominięty,
     * zapis przechodzi, dokument powstaje). Nigdy błąd serwera.
     *
     * @return array<string, array{0: string, 1: int}>
     */
    public static function otherSchemes(): array
    {
        return [
            'tło ftp' => ['<div style="background:url(ftp://example.test/tlo.svg)">x</div>', 422],
            'tło phar' => ['<div style="background:url(phar://__ARCHIWUM__/tlo.svg)">x</div>', 422],
            'obraz ftp' => ['<img src="ftp://example.test/obraz.svg" alt="">', 200],
            'obraz phar' => ['<img src="phar://__ARCHIWUM__/obraz.svg" alt="">', 200],
            'arkusz phar' => ['<link rel="stylesheet" href="phar://__ARCHIWUM__/arkusz.css"><p>x</p>', 200],
            'obraz ze ścieżki pliku' => ['<img src="__PLIK__" alt="">', 200],
        ];
    }

    #[DataProvider('otherSchemes')]
    public function test_address_outside_the_protocol_list_is_refused_at_save_or_skipped_by_the_engine_never_a_server_error(string $content, int $expected): void
    {
        $this->seed(DocumentTemplateSeeder::class);
        $this->actingAsRole('project_manager');

        $response = $this->putJson('/api/v1/document-templates/agreement', ['content' => $this->withPaths($content)]);

        $this->assertNotSame(500, $response->status());
        $response->assertStatus($expected);

        if ($expected === 422) {
            $this->assertSame(self::REFUSAL, $response->json('error.errors.content.0'));
            $this->assertSame(3, DocumentTemplateVersion::query()->count());

            return;
        }

        // Zapis przeszedł: dokument z tego wzoru powstaje, a zasób jest pominięty z odmową silnika.
        $logged = $this->captureLog();
        $GLOBALS['_dompdf_warnings'] = [];

        $bytes = PdfService::renderBytes('documents.volunteer-agreement', $this->goldenData());

        $this->assertStringStartsWith('%PDF', $bytes);
        $this->assertCount(1, (array) $GLOBALS['_dompdf_warnings']);
        $this->assertStringContainsString('Permission denied', (string) $GLOBALS['_dompdf_warnings'][0]);
        $this->assertSame([], $this->errors($logged()));
    }

    /**
     * Treść wstawiona wprost do bazy, z pominięciem trasy zapisu: pobranie
     * dokumentu osoby dalej działa, dokument powstaje z pliku w repozytorium.
     */
    public function test_template_in_the_database_the_engine_cannot_generate_gives_the_document_from_the_file_and_one_log_entry(): void
    {
        $this->seed();

        $document = Document::query()->where('type', 'volunteer_agreement')->firstOrFail();
        $owner = User::query()->findOrFail($document->user_id);
        $this->assertSame('documents.volunteer-agreement', DocumentIssuer::viewFor($document->type));

        // Migawka w pełnym kształcie (sztuczne dane próby), żeby było czego szukać w dzienniku.
        $snapshot = $this->goldenData();
        $document->update(['data_snapshot' => $snapshot]);

        DocumentTemplate::query()->updateOrCreate(['type' => 'agreement'], [
            'content' => '<style>p { font-family: "DejaVu Serif"; }</style><p>tajny-tekst-wzoru {{ $first_name }} {{ $pesel }}</p>'
                .'<div style="background:url('.$this->file.')">x</div>',
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
            ['type' => 'agreement', 'version' => 7, 'exception' => ErrorException::class],
            $errors[0]['context'],
        );

        $line = $errors[0]['message'].' '.json_encode($errors[0]['context'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $forbidden = ['tajny-tekst-wzoru', 'tlo-probne', 'background', 'Undefined array key', 'storage'];

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
            'content' => '<div style="background:url('.$this->file.')">x</div>',
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

        $refused = '<div style="background:url('.$this->file.')">x</div>';

        for ($attempt = 1; $attempt <= 20; $attempt++) {
            $this->putJson('/api/v1/document-templates/agreement', ['content' => $refused])->assertStatus(422);
        }

        $this->putJson('/api/v1/document-templates/agreement', ['content' => $refused])
            ->assertStatus(429)
            ->assertJsonPath('error.code', 'too_many_requests');

        // Limit dotyczy trasy zapisu, nie treści: poprawny wzór też czeka.
        $this->putJson('/api/v1/document-templates/agreement', ['content' => '<p>Numer {{ $number }}</p>'])
            ->assertStatus(429);

        $this->assertSame(3, DocumentTemplateVersion::query()->count());

        // Odczyt wzoru nie jest objęty tym limitem.
        $this->getJson('/api/v1/document-templates/agreement')->assertOk();
    }

    /**
     * Obrazy osadzone w treści a środowisko bez rozszerzenia `gd` (takie jest
     * środowisko uruchomieniowe aplikacji). Zmierzone bez `gd`: obraz PNG w `<img>`
     * oraz KAŻDY obraz tła kończą się błędem silnika; obraz JPEG i SVG w `<img>`
     * generują się.
     *
     * Próba nie może zależeć od tego, czy środowisko biegu ma `gd`, więc twarda
     * jest tylko zasada „nigdy błąd serwera”: bez `gd` zapis jest odmową 422, a z
     * `gd` wolno mu przejść (wtedy obraz jest osadzany) — rozstrzyga
     * `extension_loaded('gd')`. Dla tła z `gd` wynik nie był mierzony, dlatego tam
     * dopuszczone są oba kody.
     *
     * @return array<string, array{0: string, 1: bool}>
     */
    public static function inlineImages(): array
    {
        return [
            'obraz PNG w img' => ['<img src="'.self::PNG.'" alt="">', true],
            'obraz PNG w tle' => ['<div style="width:10px;height:10px;background:url('.self::PNG.')">x</div>', false],
            'obraz SVG w tle' => ['<div style="width:10px;height:10px;background:url(__SVG__)">x</div>', false],
        ];
    }

    #[DataProvider('inlineImages')]
    public function test_inline_image_the_environment_cannot_draw_is_refused_at_save_and_never_a_server_error(string $content, bool $measuredWithGd): void
    {
        $this->seed(DocumentTemplateSeeder::class);
        $this->actingAsRole('super_admin');

        $content = '<p>Numer {{ $number }}</p>'.$this->withPaths($content);

        $response = $this->putJson('/api/v1/document-templates/agreement', ['content' => $content]);

        $this->assertNotSame(500, $response->status());

        if (! extension_loaded('gd')) {
            $response->assertStatus(422);
            $this->assertSame(self::REFUSAL, $response->json('error.errors.content.0'));
            $this->assertSame(3, DocumentTemplateVersion::query()->count());
        } elseif ($measuredWithGd) {
            $response->assertOk();
        } else {
            $this->assertContains($response->status(), [200, 422]);
        }

        // Ta sama treść już w bazie: dokument powstaje zawsze — z treści albo, przez siatkę, z pliku.
        DocumentTemplate::query()->where('type', 'agreement')->update(['content' => $content, 'version' => 9]);

        $this->assertStringStartsWith('%PDF', PdfService::renderBytes('documents.volunteer-agreement', $this->goldenData()));
    }

    /**
     * Obraz JPEG i SVG w `<img>` generują się także bez `gd` — zapis przechodzi.
     *
     * @return array<string, array{0: string}>
     */
    public static function drawableInlineImages(): array
    {
        return [
            'obraz JPEG w img' => ['data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='],
            'obraz SVG w img' => ['__SVG__'],
        ];
    }

    #[DataProvider('drawableInlineImages')]
    public function test_inline_image_the_engine_draws_without_extensions_is_saved(string $address): void
    {
        $this->seed(DocumentTemplateSeeder::class);
        $this->actingAsRole('super_admin');

        $this->putJson('/api/v1/document-templates/agreement', [
            'content' => '<p>Numer {{ $number }}</p><img src="'.$this->withPaths($address).'" alt="">',
        ])->assertOk()->assertJsonPath('data.version', 2)->assertJsonPath('data.current_version_unused', false);
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
