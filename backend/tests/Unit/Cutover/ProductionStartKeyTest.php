<?php

namespace Tests\Unit\Cutover;

use App\Support\ProductionStart;
use App\Support\RestoreTrial;
use FilesystemIterator;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * Znaczniki przejscia (start produkcji i potwierdzone odtworzenie probne) sa
 * kluczami wewnetrznymi: nazwa kazdego wystepuje w kodzie aplikacji w jednym
 * pliku (jego klasie), a lista kluczy zarezerwowanych stoi w jednym miejscu.
 * Zaden inny plik w `app/` nie zna nazwy klucza, wiec zaden kontroler, zadanie
 * ani trasa nie moze go czytac ani zapisywac nazwa.
 *
 * Bez bazy i bez aplikacji - czysty skan plikow.
 */
final class ProductionStartKeyTest extends TestCase
{
    private const array OWNERS = [
        'app/Support/ProductionStart.php' => ProductionStart::KEY,
        'app/Support/RestoreTrial.php' => RestoreTrial::KEY,
    ];

    public function test_each_key_name_appears_in_one_application_file_only(): void
    {
        $root = dirname(__DIR__, 3);
        $files = $this->appFiles($root.'/app');
        $this->assertGreaterThan(300, count($files), 'Skan nie widzi drzewa aplikacji.');

        foreach (self::OWNERS as $owner => $key) {
            $this->assertArrayHasKey($owner, $files);
            $this->assertStringContainsString("'".$key."'", $files[$owner]);

            $found = [];
            foreach ($files as $path => $content) {
                if (str_contains($content, $key)) {
                    $found[] = $path;
                }
            }

            $this->assertSame([$owner], $found, "Klucz {$key} ma stac w jednym pliku.");
        }
    }

    public function test_the_reserved_list_is_the_one_the_classes_declare(): void
    {
        $this->assertSame([ProductionStart::KEY, RestoreTrial::KEY], ProductionStart::RESERVED_KEYS);
    }

    /**
     * @return array<string, string> sciezka wzgledem backend/ => tresc
     */
    private function appFiles(string $dir): array
    {
        $files = [];
        $base = dirname($dir);
        $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));

        foreach ($iterator as $file) {
            if ($file->isFile() && $file->getExtension() === 'php') {
                $files[str_replace('\\', '/', substr($file->getPathname(), strlen($base) + 1))] = (string) file_get_contents($file->getPathname());
            }
        }

        return $files;
    }
}
