<?php

namespace Tests\Feature\Bezpieczenstwo;

use App\Models\Application;
use App\Models\Edition;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * Próby z przeglądu ASVS L2 (`docs/bezpieczenstwo/przeglad-asvs-dane.md`),
 * wiersze V8.1.1, V8.2.1, V14.4.3, V14.4.4, V14.4.5, V14.4.6 i V14.4.7.
 *
 * Pilnowany warunek: middleware `App\Http\Middleware\SecurityHeaders`
 * dopięty do grupy `api` w `bootstrap/app.php`.
 */
class NaglowkiOdpowiedziTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    public function test_odpowiedz_z_profilem_zabrania_buforowania(): void
    {
        $this->actingAsRole('volunteer');

        $odpowiedz = $this->getJson('/api/v1/me')->assertOk();

        $this->assertStringContainsString('no-store', (string) $odpowiedz->headers->get('Cache-Control'));
        $this->assertStringNotContainsString('public', (string) $odpowiedz->headers->get('Cache-Control'));
    }

    public function test_pobranie_skanu_dyplomu_nie_jest_buforowane_publicznie(): void
    {
        Storage::fake('local');
        $edycja = Edition::factory()->create(['status' => 'active']);
        $zgloszenie = Application::factory()->create([
            'edition_id' => $edycja->id,
            'diploma_scan_path' => 'diplomas/skan.pdf',
        ]);
        Storage::disk('local')->put($zgloszenie->diploma_scan_path, '%PDF-1.4 próba');
        $this->actingAsRole('super_admin');

        $odpowiedz = $this->get("/api/v1/admin/applications/{$zgloszenie->id}/diploma-scan")->assertOk();

        $this->assertStringContainsString('no-store', (string) $odpowiedz->headers->get('Cache-Control'));
        $this->assertStringNotContainsString('public', (string) $odpowiedz->headers->get('Cache-Control'));
        $this->assertZakazOsadzania($odpowiedz);
    }

    public function test_odpowiedz_api_ma_csp_i_zakaz_osadzania(): void
    {
        $this->actingAsRole('volunteer');

        $odpowiedz = $this->getJson('/api/v1/me')->assertOk();

        $this->assertStringContainsString("default-src 'none'", (string) $odpowiedz->headers->get('Content-Security-Policy'));
        $this->assertZakazOsadzania($odpowiedz);
    }

    public function test_odpowiedz_api_ma_nosniff_hsts_i_polityke_referera(): void
    {
        $this->actingAsRole('volunteer');

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('Strict-Transport-Security', 'max-age=31536000')
            ->assertHeader('Referrer-Policy', 'no-referrer');
    }

    public function test_koperta_bledu_tez_ma_naglowki_bezpieczenstwa(): void
    {
        $odpowiedz = $this->getJson('/api/v1/me')
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated')
            ->assertHeader('X-Content-Type-Options', 'nosniff');

        $this->assertStringContainsString('no-store', (string) $odpowiedz->headers->get('Cache-Control'));
        $this->assertZakazOsadzania($odpowiedz);
    }

    private function assertZakazOsadzania(TestResponse $odpowiedz): void
    {
        $odpowiedz->assertHeader('X-Frame-Options', 'DENY');
        $this->assertStringContainsString("frame-ancestors 'none'", (string) $odpowiedz->headers->get('Content-Security-Policy'));
    }
}
