<?php

namespace Tests\Feature\Bezpieczenstwo;

use App\Models\Application;
use App\Models\Edition;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * Próby luk z przeglądu ASVS L2 (`docs/bezpieczenstwo/przeglad-asvs-dane.md`),
 * wiersze V8.1.1, V8.2.1, V14.4.3, V14.4.4, V14.4.5, V14.4.7 i V14.5.3.
 *
 * API nie ustawia nagłówków bezpieczeństwa ani zakazu buforowania. Brak
 * `config/cors.php` zostawia domyślną konfigurację frameworka, która dopuszcza
 * każde źródło.
 */
class NaglowkiOdpowiedziTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    private const string DOKUMENT = 'docs/bezpieczenstwo/przeglad-asvs-dane.md';

    public function test_odpowiedz_z_profilem_zabrania_buforowania(): void
    {
        $this->markTestIncomplete(self::DOKUMENT.', wiersz V8.2.1: odpowiedzi z danymi osobowymi nie mają no-store.');

        $this->actingAsRole('volunteer');

        $cache = (string) $this->getJson('/api/v1/me')->assertOk()->headers->get('Cache-Control');

        $this->assertStringContainsString('no-store', $cache);
    }

    public function test_pobranie_skanu_dyplomu_nie_jest_buforowane_publicznie(): void
    {
        $this->markTestIncomplete(self::DOKUMENT.', wiersz V8.1.1: pobranie pliku jest domyślnie publiczne dla pamięci podręcznych.');

        Storage::fake('local');
        Storage::disk('local')->put('diplomas/skan.pdf', '%PDF-1.4 próba');
        $edycja = Edition::factory()->create(['status' => 'active']);
        $zgloszenie = Application::factory()->create([
            'edition_id' => $edycja->id,
            'diploma_scan_path' => 'diplomas/skan.pdf',
        ]);
        $this->actingAsRole('project_manager');

        $cache = (string) $this->get("/api/v1/admin/applications/{$zgloszenie->id}/diploma-scan")
            ->assertOk()
            ->headers->get('Cache-Control');

        $this->assertStringNotContainsString('public', $cache);
        $this->assertStringContainsString('no-store', $cache);
    }

    public function test_odpowiedz_api_ma_csp_i_zakaz_osadzania(): void
    {
        $this->markTestIncomplete(self::DOKUMENT.', wiersze V14.4.3, V14.4.7: brak CSP i zakazu osadzania w ramce.');

        $this->actingAsRole('volunteer');

        $odpowiedz = $this->getJson('/api/v1/me')->assertOk();

        $this->assertStringContainsString("frame-ancestors 'none'", (string) $odpowiedz->headers->get('Content-Security-Policy'));
        $odpowiedz->assertHeader('X-Frame-Options', 'DENY');
    }

    public function test_odpowiedz_api_ma_nosniff_i_hsts(): void
    {
        $this->markTestIncomplete(self::DOKUMENT.', wiersze V14.4.4, V14.4.5: brak nosniff i HSTS.');

        $this->actingAsRole('volunteer');

        $odpowiedz = $this->getJson('/api/v1/me')->assertOk();

        $odpowiedz->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertStringContainsString('max-age=', (string) $odpowiedz->headers->get('Strict-Transport-Security'));
    }

    public function test_cors_nie_przepuszcza_obcego_zrodla(): void
    {
        $this->markTestIncomplete(self::DOKUMENT.', wiersz V14.5.3: CORS dopuszcza każde źródło.');

        $this->withHeaders([
            'Origin' => 'https://obce-zrodlo.invalid',
            'Access-Control-Request-Method' => 'GET',
        ])->options('/api/v1/me')->assertHeaderMissing('Access-Control-Allow-Origin');
    }
}
