<?php

namespace Tests\Feature\H13;

use App\Models\Certificate;
use Illuminate\Foundation\Testing\RefreshDatabase;

/**
 * Pakiet H13 · publiczna weryfikacja — kryterium 4 (QR/numer prowadzi do
 * weryfikacji; nieznany albo błędny numer → 404 z identycznym komunikatem).
 */
class PublicVerificationTest extends CertificatePackageCase
{
    use RefreshDatabase;

    private const string NOT_FOUND = 'Nie znaleziono certyfikatu o podanym numerze.';

    public function test_verify_by_number_returns_status_for_a_real_certificate(): void
    {
        $this->getJson('/api/v1/verify/NP/2026/001')
            ->assertOk()
            ->assertJsonPath('data.number', 'NP/2026/001')
            ->assertJsonPath('data.status', 'valid')
            ->assertJsonPath('data.edition', '2026')
            ->assertJsonStructure(['data' => ['number', 'status', 'edition', 'issued_at']]);
    }

    public function test_verify_needs_no_authentication(): void
    {
        // Bez nagłówka Authorization — trasa publiczna (config/public_routes.php).
        $this->getJson('/api/v1/verify/NP/2026/001')->assertOk();
    }

    public function test_unknown_number_and_malformed_number_return_the_same_404(): void
    {
        $unknown = $this->getJson('/api/v1/verify/NP/2026/999')
            ->assertStatus(404)
            ->assertJsonPath('error.message', self::NOT_FOUND);

        $malformed = $this->getJson('/api/v1/verify/zupelnie-nie-numer')
            ->assertStatus(404)
            ->assertJsonPath('error.message', self::NOT_FOUND);

        $this->assertSame(
            $unknown->json('error.message'),
            $malformed->json('error.message'),
        );
    }

    public function test_revoked_certificate_reports_revoked_status(): void
    {
        Certificate::where('number', 'NP/2026/001')->update([
            'revoked_at' => now(),
            'revoked_reason' => 'test',
        ]);

        $this->getJson('/api/v1/verify/NP/2026/001')
            ->assertOk()
            ->assertJsonPath('data.status', 'revoked');
    }

    public function test_verify_by_qr_token_returns_the_certificate(): void
    {
        $token = Certificate::where('number', 'NP/2026/001')->firstOrFail()->verification_token;

        $this->getJson("/api/v1/verify/qr/{$token}")
            ->assertOk()
            ->assertJsonPath('data.number', 'NP/2026/001')
            ->assertJsonPath('data.status', 'valid');
    }

    public function test_verify_by_unknown_qr_token_returns_404(): void
    {
        $this->getJson('/api/v1/verify/qr/nieistniejacy-token')
            ->assertStatus(404)
            ->assertJsonPath('error.message', self::NOT_FOUND);
    }
}
