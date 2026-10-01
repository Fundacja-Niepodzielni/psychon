<?php

namespace Tests\Unit\Przyrzad;

use FilesystemIterator;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use SplFileInfo;

/**
 * Strażnik: kod aplikacji nie kompiluje ani nie wykonuje treści, która nie jest
 * plikiem widoku z repozytorium.
 *
 * Biała lista, nie czarna: w `app/**` nie może wystąpić żadna z dróg, którymi
 * tekst z bazy albo z żądania mógłby trafić do kompilatora szablonów albo do
 * interpretera — kompilacja napisu, `eval`, widok wskazany czymkolwiek innym niż
 * literał nazwy pliku widoku z repozytorium, odwołanie do katalogu widoków albo
 * katalogu skompilowanych widoków (zapis pliku widoku). Lista wyjątków jest
 * jawna i pusta.
 *
 * Kontrola dodatnia stoi w tym samym pliku: każda z postaci podana regule w
 * sztucznym pliku musi dać trafienie, a strażnik musi przejrzeć co najmniej
 * tyle plików, ile aplikacja ich naprawdę ma — inaczej zielony wynik nie mówi,
 * czy reguła w ogóle umie się zaczerwienić.
 *
 * Bez bazy i bez aplikacji, więc biegnie w kroku równoległym.
 *
 * `php artisan test --filter=TemplateCompilationGuard`
 */
final class TemplateCompilationGuardTest extends TestCase
{
    /** Aplikacja ma dziś ponad 350 plików PHP; wynik poniżej progu znaczy, że strażnik patrzy w pustkę. */
    private const int MINIMUM_FILES = 300;

    /**
     * Wyjątki: plik => powód. Pusta — i taka ma zostać.
     *
     * @var array<string, string>
     */
    private const array ALLOWED = [];

    public function test_application_code_has_no_way_to_compile_or_execute_text(): void
    {
        $files = $this->applicationFiles();

        $this->assertGreaterThan(self::MINIMUM_FILES, count($files), 'Strażnik przejrzał za mało plików.');
        $this->assertSame([], self::ALLOWED, 'Lista wyjątków strażnika ma być pusta.');
        $this->assertSame([], $this->violations($files));
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function forbiddenForms(): array
    {
        return [
            'kompilacja napisu przez fasadę' => ['<?php return Blade::render($template->content, $data);', 'kompilacja napisu jako szablonu'],
            'kompilacja napisu przez fasadę z pełną nazwą' => ['<?php \Illuminate\Support\Facades\Blade::render($x);', 'kompilacja napisu jako szablonu'],
            'compileString przez fasadę' => ['<?php $php = Blade::compileString($content);', 'kompilacja napisu jako szablonu'],
            'compileString na kompilatorze' => ['<?php $php = app("blade.compiler")->compileString($content);', 'kompilacja napisu jako szablonu'],
            'eval' => ['<?php eval($code);', 'wykonanie napisu jako kodu'],
            'eval ze spacją' => ['<?php eval ("?>".$compiled);', 'wykonanie napisu jako kodu'],
            'widok ze zmiennej' => ['<?php return view($view, $data)->render();', 'widok wskazany inaczej niż literałem'],
            'widok ze sklejanego napisu' => ['<?php return view("documents.".$name)->render();', 'widok wskazany inaczej niż literałem'],
            'View::make ze zmiennej' => ['<?php return View::make($view)->render();', 'widok wskazany inaczej niż literałem'],
            'widok w wiadomości ze zmiennej' => ['<?php return $this->subject("x")->view($this->template);', 'widok wskazany inaczej niż literałem'],
            'literał widoku, którego nie ma w repozytorium' => ['<?php return view("documents.nie-ma-takiego")->render();', 'widok spoza repozytorium'],
            'katalog widoków' => ['<?php file_put_contents(resource_path("views/x.blade.php"), $content);', 'odwołanie do katalogu widoków'],
            'katalog widoków przez ścieżkę' => ['<?php File::put(base_path("resources/views/x.blade.php"), $content);', 'odwołanie do katalogu widoków'],
            'katalog skompilowanych widoków' => ['<?php File::put(config("view.compiled")."/x.php", $content);', 'odwołanie do katalogu widoków'],
            'katalog skompilowanych widoków przez ścieżkę' => ['<?php File::put(storage_path("framework/views/x.php"), $content);', 'odwołanie do katalogu widoków'],
        ];
    }

    #[DataProvider('forbiddenForms')]
    public function test_rule_recognises_every_forbidden_form(string $source, string $expected): void
    {
        $violations = $this->violations(['app/Services/Kontrola.php' => $source]);

        $this->assertCount(1, $violations);
        $this->assertStringContainsString($expected, $violations[0]);
    }

    public function test_rule_accepts_what_the_application_legitimately_does(): void
    {
        $this->assertSame([], $this->violations([
            'app/Services/A.php' => '<?php return view(\'pdf.certificate\', $data)->render();',
            'app/Mail/B.php' => '<?php return $this->subject("x")->view(\'mail.help.received\');',
            'app/Policies/C.php' => '<?php class C { public function view(User $user, Document $document): bool { return true; } }',
            'app/Services/D.php' => '<?php // review($x) i overview($y) to nie widoki'."\n".'$a = $this->review($x); $b = preview($y);',
        ]));
    }

    /**
     * @param  array<string, string>  $files  ścieżka względem `backend/` => treść
     * @return list<string>
     */
    private function violations(array $files): array
    {
        $violations = [];

        foreach ($files as $path => $source) {
            if (array_key_exists($path, self::ALLOWED)) {
                continue;
            }

            $source = $this->withoutComments($source);

            if (preg_match('/\bBlade::(render|compileString)\b|\bcompileString\s*\(/', $source) === 1) {
                $violations[] = $path.': kompilacja napisu jako szablonu';
            }

            if (preg_match('/(?<![\w>:$])eval\s*\(/', $source) === 1) {
                $violations[] = $path.': wykonanie napisu jako kodu';
            }

            if (preg_match('/resources\/views|resource_path\(\s*[\'"]views|view\.compiled|view\.paths|framework\/views/', $source) === 1) {
                $violations[] = $path.': odwołanie do katalogu widoków';
            }

            // Każde wywołanie `view(...)` / `View::make(...)` (także `->view(...)` wiadomości), bez definicji metod.
            preg_match_all('/(?<!function )(?<![\w$])(?:View::make|view)\s*\(\s*([^)]{0,80})/', $source, $calls);

            foreach ($calls[1] as $argument) {
                if (preg_match('/^([\'"])([A-Za-z0-9._-]+)\1\s*(?:,|$)/', trim($argument), $literal) !== 1) {
                    $violations[] = $path.': widok wskazany inaczej niż literałem';

                    continue;
                }

                if (! is_file($this->backendPath('resources/views/'.str_replace('.', '/', $literal[2]).'.blade.php'))) {
                    $violations[] = $path.': widok spoza repozytorium ('.$literal[2].')';
                }
            }
        }

        return $violations;
    }

    /**
     * Kod bez komentarzy: zdanie w komentarzu („a self view (this resource…") to nie wywołanie.
     */
    private function withoutComments(string $source): string
    {
        $code = '';

        foreach (token_get_all($source) as $token) {
            if (is_array($token) && in_array($token[0], [T_COMMENT, T_DOC_COMMENT], true)) {
                continue;
            }

            $code .= is_array($token) ? $token[1] : $token;
        }

        return $code;
    }

    /**
     * @return array<string, string>
     */
    private function applicationFiles(): array
    {
        $files = [];
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($this->backendPath('app'), FilesystemIterator::SKIP_DOTS),
        );

        /** @var SplFileInfo $file */
        foreach ($iterator as $file) {
            if ($file->isFile() && $file->getExtension() === 'php') {
                $relative = 'app/'.str_replace('\\', '/', substr($file->getPathname(), strlen($this->backendPath('app')) + 1));
                $files[$relative] = (string) file_get_contents($file->getPathname());
            }
        }

        return $files;
    }

    private function backendPath(string $relative): string
    {
        return dirname(__DIR__, 3).'/'.$relative;
    }
}
