<?php

namespace Tests\Feature\Bezpieczenstwo;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * Próby luk z przeglądu ASVS L2 (`docs/bezpieczenstwo/przeglad-asvs-dane.md`),
 * wiersz V8.1.4.
 *
 * Limit żądań mają tylko trzy trasy (`routes/api/sso.php`, `routes/api/h03.php`,
 * `routes/api/h01.php`). Publiczna weryfikacja certyfikatu i wgrywanie plików
 * przyjmują dowolnie wiele żądań.
 */
class LimityZadanTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    private const string DOKUMENT = 'docs/bezpieczenstwo/przeglad-asvs-dane.md';

    public function test_publiczna_weryfikacja_certyfikatu_ma_limit_zadan(): void
    {
        $this->markTestIncomplete(self::DOKUMENT.', wiersz V8.1.4: publiczna weryfikacja certyfikatu nie ma limitu żądań.');

        $statusy = [];

        for ($i = 0; $i < 120; $i++) {
            $statusy[] = $this->getJson('/api/v1/verify/NP-2026-'.$i)->status();
        }

        $this->assertContains(429, $statusy);
    }

    public function test_wgrywanie_zalacznikow_ma_limit_zadan(): void
    {
        $this->markTestIncomplete(self::DOKUMENT.', wiersz V8.1.4: wgrywanie załączników profilu nie ma limitu żądań.');

        Storage::fake('local');
        $this->actingAsRole('volunteer');

        $statusy = [];

        for ($i = 0; $i < 60; $i++) {
            $statusy[] = $this->post('/api/v1/psychologist-profile/documents', [
                'type' => 'inne',
                'file' => UploadedFile::fake()->createWithContent("plik-{$i}.pdf", '%PDF-1.4 próba'),
            ], ['Accept' => 'application/json'])->status();
        }

        $this->assertContains(429, $statusy);
    }
}
