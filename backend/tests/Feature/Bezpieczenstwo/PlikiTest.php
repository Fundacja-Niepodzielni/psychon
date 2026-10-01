<?php

namespace Tests\Feature\Bezpieczenstwo;

use App\Models\ProfileDocument;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\WithProfileDocumentEncryptionKey;
use Tests\TestCase;

/**
 * Próba z przeglądu ASVS L2 (`docs/bezpieczenstwo/przeglad-asvs-dane.md`),
 * wiersz V12.1.3.
 *
 * Pilnowany warunek: `PsychologistProfileController::MAX_DOCUMENTS`
 * sprawdzane w `storeDocument()` przed zapisem pliku.
 */
class PlikiTest extends TestCase
{
    use RefreshDatabase;
    use WithProfileDocumentEncryptionKey;

    private const int LIMIT_ZALACZNIKOW = 10;

    public function test_liczba_zalacznikow_profilu_jest_ograniczona(): void
    {
        Storage::fake('local');
        $this->useFreshProfileDocumentEncryptionKey();
        $absolwent = User::factory()->create(['role' => 'volunteer', 'program_completed_at' => now()->subDay()]);
        $this->actingAs($absolwent, 'keycloak');

        for ($i = 1; $i <= self::LIMIT_ZALACZNIKOW; $i++) {
            $this->wgraj($i)->assertCreated();
        }

        $this->wgraj(self::LIMIT_ZALACZNIKOW + 1)
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonValidationErrors('file', 'error.errors');

        $this->assertSame(self::LIMIT_ZALACZNIKOW, ProfileDocument::query()->count());
        $this->assertCount(self::LIMIT_ZALACZNIKOW, Storage::disk('local')->allFiles());
    }

    private function wgraj(int $numer): TestResponse
    {
        return $this->postJson('/api/v1/psychologist-profile/documents', [
            'type' => 'inne',
            'file' => UploadedFile::fake()->createWithContent("plik-{$numer}.pdf", '%PDF-1.4 próba'),
        ]);
    }
}
