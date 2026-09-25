<?php

namespace Tests\Feature\DocumentTemplates;

use App\Models\Certificate;
use App\Models\Edition;
use App\Models\User;
use App\Services\DocumentTemplates\DocumentTemplateRenderer;
use Database\Seeders\DocumentTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Kryterium "zasilenie = plik": dokument wygenerowany po zasileniu jest
 * bajt w bajt rowny dokumentowi sprzed zmiany. Porownanie na poziomie HTML
 * (nie koncowego PDF-a) celowo - dompdf osadza znacznik czasu w metadanych
 * pliku, wiec dwa niezalezne rendery tego samego HTML-a nie sa identyczne
 * bajt w bajt nawet bez zadnej zmiany tresci; HTML jest tym, co definiuje
 * dokument i co ten seed przenosi z pliku do bazy.
 *
 * Kontrola negatywna (osobny bieg, nie w tym pliku): podmiana jednego znaku
 * w `DocumentTemplateSeeder::SOURCE_VIEWS` (np. dopisanie spacji do tresci
 * kopiowanej z pliku) oblewa kazda z ponizszych prob.
 */
class DocumentTemplateSeedByteEqualityTest extends TestCase
{
    use RefreshDatabase;

    public static function typeAndViewProvider(): array
    {
        return [
            'agreement' => ['agreement', 'documents.volunteer-agreement'],
            'attendance_certificate' => ['attendance_certificate', 'documents.internship-certificate'],
        ];
    }

    #[DataProvider('typeAndViewProvider')]
    public function test_seeded_template_renders_byte_identical_to_the_file(string $type, string $view): void
    {
        $fromFile = view($view, [])->render();

        $this->seed(DocumentTemplateSeeder::class);

        $this->assertDatabaseHas('document_templates', ['type' => $type, 'version' => 1]);

        $fromDatabase = DocumentTemplateRenderer::html($view, []);

        $this->assertSame($fromFile, $fromDatabase);
    }

    public function test_seeded_certificate_template_renders_byte_identical_to_the_file(): void
    {
        $user = User::factory()->create();
        $edition = Edition::factory()->create();
        $certificate = Certificate::create([
            'user_id' => $user->id,
            'edition_id' => $edition->id,
            'number' => 'NP/2026/001',
            'issued_at' => now(),
            'verification_token' => Str::random(40),
            'conditions_snapshot' => [],
        ]);

        $data = [
            'certificate' => $certificate,
            'user' => $user,
            'edition' => $edition,
            'verify_url' => 'https://example.test/certyfikat?token=abc',
            'qr_svg' => 'data:image/svg+xml;base64,',
        ];

        $fromFile = view('pdf.certificate', $data)->render();

        $this->seed(DocumentTemplateSeeder::class);

        $fromDatabase = DocumentTemplateRenderer::html('pdf.certificate', $data);

        $this->assertSame($fromFile, $fromDatabase);
    }

    public function test_seeding_twice_does_not_duplicate_rows(): void
    {
        $this->seed(DocumentTemplateSeeder::class);
        $this->seed(DocumentTemplateSeeder::class);

        $this->assertDatabaseCount('document_templates', 3);
    }
}
