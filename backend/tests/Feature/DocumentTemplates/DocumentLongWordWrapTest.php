<?php

namespace Tests\Feature\DocumentTemplates;

use App\Models\DocumentTemplate;
use App\Support\PdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Tests\Unit\DocumentTemplates\PdfLongWordWrapTest;

/**
 * Wartość pola dłuższa niż wiersz jest w wydanym dokumencie łamana i WIDOCZNA na
 * stronie — tak samo, gdy dokument powstaje z pliku w repozytorium i gdy powstaje z
 * treści zapisanej w bazie.
 *
 * Reguła łamania nie stoi we wzorach: dokłada ją usługa generowania, więc treść w
 * bazie nie musi jej znać. Próba idzie drogą wydania dokumentu (`renderBytes`) i
 * czyta gotowy plik. Miara jest ta sama co w próbie bez bazy: położenie liter
 * wartości na stronie (w pionie i w poziomie), a nie ich obecność w strumieniu.
 *
 * `php artisan test --filter=DocumentLongWordWrapTest`
 */
class DocumentLongWordWrapTest extends TestCase
{
    use RefreshDatabase;

    /** Największa długość pola walidowanego. */
    private const int FIELD_LENGTH = 255;

    private const int LENGTH = 10000;

    private const string VIEW = 'documents.volunteer-agreement';

    /** Znak rozpoznawczy treści z bazy; pliku w repozytorium go nie ma. */
    private const string MARK = 'znak-tresci-z-bazy';

    public function test_document_from_the_repository_file_shows_the_longest_validated_field_value_whole(): void
    {
        DocumentTemplate::query()->where('type', 'agreement')->delete();

        $bytes = PdfService::renderBytes(self::VIEW, $this->dataWithFirstName(self::FIELD_LENGTH));

        $this->assertStringNotContainsString(self::MARK, $this->text($bytes));
        $this->assertSame(
            ['total' => self::FIELD_LENGTH, 'on_page' => self::FIELD_LENGTH, 'below' => 0, 'above' => 0, 'beyond_right_edge' => 0],
            PdfLongWordWrapTest::placement($bytes),
            'Wartość pola nie jest widoczna na stronie w całości.',
        );
    }

    public function test_document_from_the_template_stored_in_the_database_shows_a_long_paragraph_value_whole_across_pages(): void
    {
        DocumentTemplate::query()->updateOrCreate(['type' => 'agreement'], [
            'content' => '<p>'.self::MARK.'</p><p>{{ $first_name }}</p>',
            'version' => 3,
            'updated_by' => null,
        ]);

        $bytes = PdfService::renderBytes(self::VIEW, $this->dataWithFirstName(self::LENGTH));

        $this->assertStringContainsString(self::MARK, $this->text($bytes), 'Dokument nie powstał z treści zapisanej w bazie.');
        $this->assertSame(
            ['total' => self::LENGTH, 'on_page' => self::LENGTH, 'below' => 0, 'above' => 0, 'beyond_right_edge' => 0],
            PdfLongWordWrapTest::placement($bytes),
            'Wartość pola nie jest widoczna na stronach w całości.',
        );
        $this->assertGreaterThanOrEqual(2, (int) preg_match_all('~/Type\s*/Page\b~', $bytes));
    }

    /**
     * @return array<string, mixed>
     */
    private function dataWithFirstName(int $length): array
    {
        $data = (require base_path('tests/Fixtures/DocumentTemplates/golden-data.php'))['agreement']['data'];
        $data['first_name'] = str_repeat('W', $length);

        return $data;
    }

    /** Tekst gotowego pliku bez bajtu zerowego, którym czcionka wbudowana poprzedza każdy znak. */
    private function text(string $bytes): string
    {
        $this->assertStringStartsWith('%PDF', $bytes);

        preg_match_all('~stream\r?\n(.*?)\r?\nendstream~s', $bytes, $streams);
        $content = '';

        foreach ($streams[1] as $stream) {
            $plain = @gzuncompress($stream);
            $content .= $plain === false ? '' : $plain."\n";
        }

        return str_replace(chr(0), '', implode("\n", PdfLongWordWrapTest::strings($content)));
    }
}
