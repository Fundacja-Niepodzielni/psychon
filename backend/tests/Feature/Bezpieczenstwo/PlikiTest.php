<?php

namespace Tests\Feature\Bezpieczenstwo;

use App\Models\Certificate;
use App\Models\Edition;
use App\Models\ProfileDocument;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * Próby luk z przeglądu ASVS L2 (`docs/bezpieczenstwo/przeglad-asvs-dane.md`),
 * wiersze V12.1.3, V12.4.2 oraz ustalenie D-1.
 */
class PlikiTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    private const string DOKUMENT = 'docs/bezpieczenstwo/przeglad-asvs-dane.md';

    /** Maksymalna liczba załączników profilu proponowana w poprawce. */
    private const int LIMIT_ZALACZNIKOW = 10;

    public function test_liczba_zalacznikow_profilu_jest_ograniczona(): void
    {
        $this->markTestIncomplete(self::DOKUMENT.', wiersz V12.1.3: liczba załączników profilu nie ma limitu.');

        Storage::fake('local');
        $this->actingAsRole('volunteer');

        for ($i = 0; $i <= self::LIMIT_ZALACZNIKOW; $i++) {
            $this->post('/api/v1/psychologist-profile/documents', [
                'type' => 'inne',
                'file' => UploadedFile::fake()->createWithContent("plik-{$i}.pdf", '%PDF-1.4 próba'),
            ], ['Accept' => 'application/json']);
        }

        $this->assertSame(self::LIMIT_ZALACZNIKOW, ProfileDocument::query()->count());
    }

    public function test_plik_z_sygnatura_testowa_antywirusa_jest_odrzucany(): void
    {
        $this->markTestIncomplete(self::DOKUMENT.', wiersz V12.4.2: wgrywane pliki nie są skanowane.');

        Storage::fake('local');
        $this->actingAsRole('volunteer');

        $this->post('/api/v1/psychologist-profile/documents', [
            'type' => 'dyplom',
            'file' => UploadedFile::fake()->createWithContent('dyplom.pdf', "%PDF-1.4\n".self::sygnaturaTestowa()),
        ], ['Accept' => 'application/json'])->assertStatus(422);

        $this->assertSame(0, ProfileDocument::query()->count());
    }

    public function test_uniewazniony_certyfikat_nie_jest_do_pobrania(): void
    {
        $this->markTestIncomplete(self::DOKUMENT.', ustalenie D-1: pobranie certyfikatu nie sprawdza unieważnienia.');

        Storage::fake('local');
        Storage::disk('local')->put('pdf/2026/01/proba.pdf', '%PDF-1.4 próba');
        $edycja = Edition::factory()->create(['status' => 'active']);
        $osoba = $this->actingAsRole('volunteer');
        Certificate::query()->create([
            'user_id' => $osoba->id,
            'edition_id' => $edycja->id,
            'number' => 'NP/2026/999',
            'issued_at' => now()->subDay(),
            'pdf_path' => 'pdf/2026/01/proba.pdf',
            'revoked_at' => now(),
            'revoked_reason' => 'próba',
        ]);

        $this->get('/api/v1/certificate/download')->assertNotFound();
    }

    /**
     * Standardowy plik testowy EICAR, składany z części, żeby sam plik próby nie był
     * zatrzymywany przez skanery antywirusowe na stacjach roboczych.
     */
    private static function sygnaturaTestowa(): string
    {
        return implode('', [
            'X5O!P%@AP[4\\PZX54(P^)7CC)7}$',
            'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
        ]);
    }
}
