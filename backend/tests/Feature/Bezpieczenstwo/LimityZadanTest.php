<?php

namespace Tests\Feature\Bezpieczenstwo;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\WithProfileDocumentEncryptionKey;
use Tests\TestCase;

/**
 * Próby z przeglądu ASVS L2 (`docs/bezpieczenstwo/przeglad-asvs-dane.md`),
 * wiersz V8.1.4.
 *
 * Pilnowany warunek: `throttle:60,1` na trasach `verify/*`
 * (`routes/api/h13.php`) i `throttle:20,1` na wgrywaniu załączników profilu
 * (`routes/api/h15.php`).
 */
class LimityZadanTest extends TestCase
{
    use RefreshDatabase;
    use WithProfileDocumentEncryptionKey;

    public function test_publiczna_weryfikacja_certyfikatu_ma_limit_zadan(): void
    {
        for ($i = 1; $i <= 60; $i++) {
            $this->assertNotSame(
                429,
                $this->getJson('/api/v1/verify/NP-2026-'.$i)->status(),
                "Żądanie {$i} z 60 dozwolonych zostało zablokowane.",
            );
        }

        $this->getJson('/api/v1/verify/NP-2026-61')
            ->assertStatus(429)
            ->assertJsonPath('error.status', 429);
    }

    public function test_wgrywanie_zalacznikow_ma_limit_zadan(): void
    {
        Storage::fake('local');
        $this->useFreshProfileDocumentEncryptionKey();
        $absolwent = User::factory()->create(['role' => 'volunteer', 'program_completed_at' => now()->subDay()]);
        $this->actingAs($absolwent, 'keycloak');

        for ($i = 1; $i <= 20; $i++) {
            $this->assertNotSame(
                429,
                $this->wgraj($i)->status(),
                "Wgranie {$i} z 20 dozwolonych zostało zablokowane.",
            );
        }

        $this->wgraj(21)->assertStatus(429);
    }

    private function wgraj(int $numer): TestResponse
    {
        return $this->postJson('/api/v1/psychologist-profile/documents', [
            'type' => 'inne',
            'file' => UploadedFile::fake()->createWithContent("plik-{$numer}.pdf", '%PDF-1.4 próba'),
        ]);
    }
}
