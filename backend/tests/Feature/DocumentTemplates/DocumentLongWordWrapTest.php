<?php

namespace Tests\Feature\DocumentTemplates;

use App\Models\DocumentTemplate;
use App\Support\PdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Tests\Unit\DocumentTemplates\PdfLongWordWrapTest;

/**
 * Wartość pola dłuższa niż wiersz jest w wydanym dokumencie łamana — tak samo, gdy
 * dokument powstaje z pliku w repozytorium i gdy powstaje z treści zapisanej w bazie.
 *
 * Reguła łamania nie stoi we wzorach: dokłada ją usługa generowania, więc treść w
 * bazie nie musi jej znać. Próba idzie drogą wydania dokumentu (`renderBytes`) i
 * czyta gotowy plik: strumienie stron są rozpakowywane, a miara jest ta sama co w
 * próbie bez bazy — suma liter wartości, najdłuższy pojedynczy napis, liczba stron.
 *
 * `php artisan test --filter=DocumentLongWordWrapTest`
 */
class DocumentLongWordWrapTest extends TestCase
{
    use RefreshDatabase;

    private const int LENGTH = 10000;

    private const string VIEW = 'documents.volunteer-agreement';

    /** Znak rozpoznawczy treści z bazy; pliku w repozytorium go nie ma. */
    private const string MARK = 'znak-tresci-z-bazy';

    public function test_document_from_the_repository_file_breaks_a_field_value_longer_than_a_line(): void
    {
        DocumentTemplate::query()->where('type', 'agreement')->delete();

        $bytes = PdfService::renderBytes(self::VIEW, $this->dataWithLongName());
        $content = $this->pageContent($bytes);
        $runs = PdfLongWordWrapTest::runs($content);

        $this->assertStringNotContainsString(self::MARK, $this->text($content));
        $this->assertSame(self::LENGTH, array_sum($runs), 'W dokumencie nie ma całej wartości pola.');
        $this->assertLessThanOrEqual(28, max($runs), 'Wartość pola nie została połamana na wiersze.');
        $this->assertGreaterThanOrEqual(2, $this->pages($bytes));
    }

    public function test_document_from_the_template_stored_in_the_database_breaks_a_field_value_longer_than_a_line(): void
    {
        DocumentTemplate::query()->updateOrCreate(['type' => 'agreement'], [
            'content' => '<p>'.self::MARK.'</p><p>{{ $first_name }}</p>',
            'version' => 3,
            'updated_by' => null,
        ]);

        $bytes = PdfService::renderBytes(self::VIEW, $this->dataWithLongName());
        $content = $this->pageContent($bytes);
        $runs = PdfLongWordWrapTest::runs($content);

        $this->assertStringContainsString(self::MARK, $this->text($content), 'Dokument nie powstał z treści zapisanej w bazie.');
        $this->assertSame(self::LENGTH, array_sum($runs), 'W dokumencie nie ma całej wartości pola.');
        $this->assertLessThanOrEqual(44, max($runs), 'Wartość pola nie została połamana na wiersze.');
        $this->assertGreaterThanOrEqual(2, $this->pages($bytes));
    }

    /**
     * @return array<string, mixed>
     */
    private function dataWithLongName(): array
    {
        $data = (require base_path('tests/Fixtures/DocumentTemplates/golden-data.php'))['agreement']['data'];
        $data['first_name'] = str_repeat('W', self::LENGTH);

        return $data;
    }

    /** Rozpakowane strumienie gotowego pliku. */
    private function pageContent(string $bytes): string
    {
        $this->assertStringStartsWith('%PDF', $bytes);

        preg_match_all('~stream\r?\n(.*?)\r?\nendstream~s', $bytes, $streams);
        $content = '';

        foreach ($streams[1] as $stream) {
            $plain = @gzuncompress($stream);
            $content .= $plain === false ? '' : $plain."\n";
        }

        return $content;
    }

    /** Tekst dokumentu bez bajtu zerowego, którym czcionka wbudowana poprzedza każdy znak. */
    private function text(string $content): string
    {
        return str_replace(chr(0), '', implode("\n", PdfLongWordWrapTest::strings($content)));
    }

    private function pages(string $bytes): int
    {
        return (int) preg_match_all('~/Type\s*/Page\b~', $bytes);
    }
}
