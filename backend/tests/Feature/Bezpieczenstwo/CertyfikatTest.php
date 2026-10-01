<?php

namespace Tests\Feature\Bezpieczenstwo;

use App\Models\Certificate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\Feature\H13\CertificatePackageCase;

/**
 * Próba z przeglądu ASVS L2 (`docs/bezpieczenstwo/przeglad-asvs-dane.md`),
 * ustalenie D-1.
 *
 * Pilnowany warunek: `whereNull('revoked_at')` w
 * `CertificateController::download()`.
 */
class CertyfikatTest extends CertificatePackageCase
{
    use RefreshDatabase;

    public function test_uniewazniony_certyfikat_nie_jest_do_pobrania(): void
    {
        Storage::fake('local');
        $absolwent = $this->makeEligibleVolunteer();
        $this->actingAs($absolwent, 'keycloak');

        $this->postJson('/api/v1/certificate/generate')->assertStatus(202);
        $this->get('/api/v1/certificate/download')->assertOk();

        Certificate::query()->where('user_id', $absolwent->id)->sole()->update([
            'revoked_at' => now(),
            'revoked_reason' => 'próba',
        ]);

        $this->getJson('/api/v1/certificate/download')
            ->assertNotFound()
            ->assertJsonPath('error.code', 'not_found');
    }
}
