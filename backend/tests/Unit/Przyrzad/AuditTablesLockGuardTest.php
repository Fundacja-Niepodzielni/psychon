<?php

namespace Tests\Unit\Przyrzad;

use App\Support\AuditTablesLock;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use SplFileInfo;

/**
 * Strażnik przełącznika blokady dzienników.
 *
 * Blokada `audit_log` i `sensitive_access_log` jest warta tyle, ile miejsc umie ją
 * otworzyć. Ten test pilnuje dwóch rzeczy naraz:
 *
 *   1. NAZWA przełącznika występuje wyłącznie w migracji, która zakłada wyzwalacz,
 *      i w `App\Support\AuditTablesLock`. Każde inne wystąpienie (kod aplikacji,
 *      migracje, seedery, testy, trasy, konfiguracja) jest czerwone — bo to znaczy,
 *      że ktoś otwiera blokadę obok wspólnego pomocnika.
 *   2. Klasę pomocnika wolno wymienić tylko w plikach z list niżej. W kodzie
 *      aplikacji lista jest PUSTA; w testach są na niej wyłącznie dwa miejsca
 *      sprzątania bazy i świadkowie samej blokady.
 *
 * Kontrola dodatnia w obie strony stoi w tym samym pliku: reguła dostaje sztuczne
 * drzewo z nazwą w trzecim pliku oraz z wywołaniem pomocnika w kodzie aplikacji
 * i w obu przypadkach ma zgłosić naruszenie. Bez tego zielony wynik na prawdziwym
 * drzewie nie mówiłby, czy reguła w ogóle umie się zaczerwienić.
 *
 * Bez bazy i bez aplikacji (jak `ZamrozoneMigracjeTest`), więc biegnie w kroku
 * równoległym.
 *
 * `php artisan test --filter=AuditTablesLockGuard`
 */
final class AuditTablesLockGuardTest extends TestCase
{
    private const string MIGRATION = 'database/migrations/2026_10_01_140000_lock_audit_tables.php';

    private const string HELPER = 'app/Support/AuditTablesLock.php';

    private const string HELPER_CLASS = 'AuditTablesLock';

    /** Katalogi zaplecza, w których szukamy (bez `vendor`, `storage`, pamięci podręcznej). */
    private const array SCANNED = ['app', 'bootstrap', 'config', 'database', 'resources', 'routes', 'tests'];

    /**
     * Pliki kodu aplikacji, którym wolno wołać pomocnika.
     *
     * @var list<string>
     */
    private const array APP_ALLOWED = [];

    /**
     * Pliki testów, którym wolno wołać pomocnika: sprzątanie bazy i świadkowie blokady.
     *
     * @var list<string>
     */
    private const array TESTS_ALLOWED = [
        'tests/TestCase.php',
        'tests/Feature/H13/EmptyEditionConcurrentCertificateTest.php',
        'tests/Feature/AuditLock/AuditTablesLockTest.php',
        'tests/Unit/Przyrzad/AuditTablesLockGuardTest.php',
    ];

    public function test_real_tree_keeps_the_switch_in_the_migration_and_the_helper_only(): void
    {
        $files = $this->realTree();

        $this->assertGreaterThan(300, count($files), 'Przeszukano podejrzanie mało plików — strażnik nie widzi drzewa.');
        $this->assertStringContainsString(AuditTablesLock::SWITCH, $files[self::MIGRATION] ?? '', 'Migracja nie zawiera nazwy przełącznika.');
        $this->assertStringContainsString("'".AuditTablesLock::SWITCH."'", $files[self::HELPER] ?? '', 'Pomocnik nie zawiera nazwy przełącznika.');

        $this->assertSame([], $this->violations($files));
    }

    public function test_switch_name_in_a_third_file_is_reported(): void
    {
        $files = $this->minimalTree();
        $files['app/Services/Whatever.php'] = "<?php DB::select(\"select set_config('".AuditTablesLock::SWITCH."', '1', true)\");";
        $files['database/seeders/Other.php'] = '<?php // '.AuditTablesLock::SWITCH;
        $files['tests/Feature/SomeTest.php'] = '<?php $x = "'.AuditTablesLock::SWITCH.'";';

        $this->assertSame([
            'app/Services/Whatever.php: nazwa przełącznika poza migracją i pomocnikiem',
            'database/seeders/Other.php: nazwa przełącznika poza migracją i pomocnikiem',
            'tests/Feature/SomeTest.php: nazwa przełącznika poza migracją i pomocnikiem',
        ], $this->violations($files));
    }

    public function test_helper_used_outside_the_allowed_files_is_reported(): void
    {
        $files = $this->minimalTree();
        $files['app/Services/Cutover/Purge.php'] = '<?php \\App\\Support\\'.self::HELPER_CLASS.'::allowPurgeInCurrentTransaction();';
        $files['tests/Feature/SomeTest.php'] = '<?php use App\\Support\\'.self::HELPER_CLASS.';';
        $files['database/seeders/DemoSeeder.php'] = '<?php '.self::HELPER_CLASS.'::allowPurgeInCurrentTransaction();';
        $files['tests/TestCase.php'] = '<?php '.self::HELPER_CLASS.'::allowPurgeInCurrentTransaction();';

        $this->assertSame([
            'app/Services/Cutover/Purge.php: pomocnik blokady wołany spoza listy dozwolonych',
            'database/seeders/DemoSeeder.php: pomocnik blokady wołany spoza listy dozwolonych',
            'tests/Feature/SomeTest.php: pomocnik blokady wołany spoza listy dozwolonych',
        ], $this->violations($files));
    }

    public function test_minimal_tree_without_extra_uses_is_clean(): void
    {
        $this->assertSame([], $this->violations($this->minimalTree()));
    }

    /**
     * Reguła strażnika na mapie `ścieżka względem backend/ => treść`.
     *
     * @param  array<string, string>  $files
     * @return list<string>
     */
    private function violations(array $files): array
    {
        $found = [];
        ksort($files);

        foreach ($files as $path => $content) {
            if (str_contains($content, AuditTablesLock::SWITCH) && ! in_array($path, [self::MIGRATION, self::HELPER], true)) {
                $found[] = $path.': nazwa przełącznika poza migracją i pomocnikiem';
            }

            if ($path === self::HELPER || ! str_contains($content, self::HELPER_CLASS)) {
                continue;
            }

            $allowed = in_array($path, self::APP_ALLOWED, true) || in_array($path, self::TESTS_ALLOWED, true);

            if (! $allowed) {
                $found[] = $path.': pomocnik blokady wołany spoza listy dozwolonych';
            }
        }

        return $found;
    }

    /** @return array<string, string> */
    private function minimalTree(): array
    {
        return [
            self::MIGRATION => "<?php // current_setting('".AuditTablesLock::SWITCH."', true)",
            self::HELPER => '<?php final class '.self::HELPER_CLASS." { const SWITCH = '".AuditTablesLock::SWITCH."'; }",
            'app/Support/AuditLog.php' => '<?php // zwykły plik bez przełącznika',
        ];
    }

    /** @return array<string, string> */
    private function realTree(): array
    {
        $root = dirname(__DIR__, 3);
        $files = [];

        foreach (self::SCANNED as $directory) {
            $iterator = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($root.'/'.$directory, RecursiveDirectoryIterator::SKIP_DOTS)
            );

            /** @var SplFileInfo $file */
            foreach ($iterator as $file) {
                if (! $file->isFile()) {
                    continue;
                }

                $relative = str_replace('\\', '/', substr($file->getPathname(), strlen($root) + 1));

                if (str_starts_with($relative, 'bootstrap/cache/')) {
                    continue;
                }

                $files[$relative] = (string) file_get_contents($file->getPathname());
            }
        }

        return $files;
    }
}
