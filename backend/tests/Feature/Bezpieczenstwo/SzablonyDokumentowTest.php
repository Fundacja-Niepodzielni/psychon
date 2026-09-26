<?php

namespace Tests\Feature\Bezpieczenstwo;

use App\Models\DocumentTemplate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * Próby z przeglądu ASVS L2 (`docs/bezpieczenstwo/przeglad-asvs-dane.md`),
 * wiersze V5.2.1, V5.2.4, V5.2.5, V5.2.8 i V12.3.6.
 *
 * Wzór dokumentu zapisany z panelu trafia do `Blade::render()`, więc każda
 * dyrektywa i każde wyrażenie PHP we wzorze wykonałoby się na serwerze.
 * Pilnowany warunek: `App\Rules\SafeDocumentTemplate` i limit `max:200000`
 * w `UpdateDocumentTemplateRequest`.
 */
class SzablonyDokumentowTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    private const string TRESC_POCZATKOWA = 'Tresc poczatkowa.';

    protected function setUp(): void
    {
        parent::setUp();

        foreach (DocumentTemplate::TYPES as $type) {
            DocumentTemplate::create([
                'type' => $type,
                'content' => self::TRESC_POCZATKOWA,
                'version' => 1,
                'updated_by' => null,
            ]);
        }

        $this->actingAsRole('project_manager');
    }

    public function test_wzor_z_kodem_php_jest_odrzucany(): void
    {
        $this->assertRejected('certificate', '<p>@php echo 1; @endphp</p>');
        $this->assertRejected('certificate', '<p><?php echo 1; ?></p>');
    }

    public function test_wzor_z_surowym_wyjsciem_i_dolaczaniem_widokow_jest_odrzucany(): void
    {
        $this->assertRejected('agreement', '<p>{!! $user !!}</p>');
        $this->assertRejected('agreement', "<p>@include('welcome')</p>");
    }

    public function test_wstawka_z_wywolaniem_funkcji_jest_odrzucana(): void
    {
        $this->assertRejected('agreement', '<p>{{ phpinfo() }}</p>');
        $this->assertRejected('agreement', "<p>{{ \$certificate->issued_at->format('Y') }}</p>");
    }

    public function test_tresc_wzoru_ma_limit_dlugosci(): void
    {
        $this->assertRejected('agreement', str_repeat('a', 200_001));
    }

    public function test_wzor_z_repozytorium_przechodzi_walidacje(): void
    {
        // Middleware `TrimStrings` obcina końcowy znak nowego wiersza pliku.
        $tresc = trim(File::get(resource_path('views/documents/volunteer-agreement.blade.php')));

        $this->putJson('/api/v1/document-templates/agreement', ['content' => $tresc])
            ->assertOk()
            ->assertJsonPath('data.content', $tresc);
    }

    private function assertRejected(string $type, string $content): void
    {
        $this->putJson("/api/v1/document-templates/{$type}", ['content' => $content])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonValidationErrors('content', 'error.errors');

        $this->assertSame(
            self::TRESC_POCZATKOWA,
            DocumentTemplate::query()->where('type', $type)->value('content'),
            'Odrzucona treść nie może trafić do bazy.',
        );
    }
}
