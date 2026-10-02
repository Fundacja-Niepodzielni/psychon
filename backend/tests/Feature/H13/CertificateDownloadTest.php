<?php

namespace Tests\Feature\H13;

use App\Models\Certificate;
use App\Models\User;
use App\Services\H13\CertificateRevoker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpFoundation\Response;

/**
 * Pakiet H13 · pobranie własnego certyfikatu (`GET /certificate/download`).
 *
 * Plik dostaje wyłącznie osoba, której najnowszy certyfikat w aktywnej edycji
 * jest ważny. Certyfikat unieważniony daje dokładnie tę samą odpowiedź co brak
 * certyfikatu — status, `code`, `message` i ciało bajt w bajt.
 */
class CertificateDownloadTest extends CertificatePackageCase
{
    use RefreshDatabase;

    public function test_valid_certificate_downloads_as_a_pdf_file(): void
    {
        Storage::fake('local');
        $grad = $this->issuedGraduate();

        $response = $this->get('/api/v1/certificate/download');

        $response->assertOk()
            ->assertHeader('content-type', 'application/pdf')
            ->assertDownload('certyfikat-NP-2026-002.pdf');
        $this->assertStringStartsWith('%PDF', (string) $response->streamedContent());
        $this->assertNull(Certificate::where('user_id', $grad->id)->firstOrFail()->revoked_at);
    }

    public function test_revoked_certificate_answers_exactly_like_no_certificate(): void
    {
        Storage::fake('local');
        $grad = $this->makeEligibleVolunteer();
        $this->actingAs($grad, 'keycloak');

        $none = $this->getJson('/api/v1/certificate/download');
        $none->assertStatus(404)->assertJsonPath('error.code', 'not_found');

        $this->postJson('/api/v1/certificate/generate')->assertStatus(202);
        $certificate = Certificate::where('user_id', $grad->id)->firstOrFail();
        CertificateRevoker::revoke($certificate, $this->admin(), 'Powód testowy.');

        // Plik zostaje na dysku — odmowa nie zależy od jego obecności.
        Storage::disk('local')->assertExists((string) $certificate->pdf_path);

        $revoked = $this->getJson('/api/v1/certificate/download');

        $this->assertSameRefusal($none, $revoked);
    }

    public function test_revoked_certificate_refusal_does_not_depend_on_the_accept_header(): void
    {
        Storage::fake('local');
        $grad = $this->makeEligibleVolunteer();
        $this->actingAs($grad, 'keycloak');

        $none = $this->get('/api/v1/certificate/download');

        $this->postJson('/api/v1/certificate/generate')->assertStatus(202);
        CertificateRevoker::revoke(
            Certificate::where('user_id', $grad->id)->firstOrFail(),
            $this->admin(),
            'Powód testowy.',
        );

        $revoked = $this->get('/api/v1/certificate/download');

        $this->assertSameRefusal($none, $revoked);
    }

    public function test_newest_certificate_decides_when_it_is_revoked(): void
    {
        Storage::fake('local');
        $grad = $this->issuedGraduate();
        $current = Certificate::where('user_id', $grad->id)->firstOrFail();

        // Starszy, ważny certyfikat tej samej osoby nie jest wydawany zamiast najnowszego.
        Certificate::create([
            'user_id' => $grad->id,
            'edition_id' => $current->edition_id,
            'number' => 'NP/2026/900',
            'issued_at' => $current->issued_at->copy()->subYear(),
            'pdf_path' => $current->pdf_path,
            'verification_token' => 'starszy-token-proby',
            'conditions_snapshot' => $current->conditions_snapshot,
        ]);
        CertificateRevoker::revoke($current, $this->admin(), 'Powód testowy.');

        $other = $this->makeEligibleVolunteer();
        $this->actingAs($other, 'keycloak');
        $none = $this->getJson('/api/v1/certificate/download');

        $this->actingAs($grad, 'keycloak');
        $revoked = $this->getJson('/api/v1/certificate/download');

        $this->assertSameRefusal($none, $revoked);
    }

    private function issuedGraduate(): User
    {
        $grad = $this->makeEligibleVolunteer();
        $this->actingAs($grad, 'keycloak');
        $this->postJson('/api/v1/certificate/generate')->assertStatus(202);

        return $grad;
    }

    private function admin(): User
    {
        return User::factory()->create(['role' => 'super_admin']);
    }

    /**
     * @param  TestResponse<Response>  $expected
     * @param  TestResponse<Response>  $actual
     */
    private function assertSameRefusal(TestResponse $expected, TestResponse $actual): void
    {
        $this->assertSame(404, $expected->getStatusCode());
        $this->assertSame($expected->getStatusCode(), $actual->getStatusCode());
        $this->assertSame($expected->json('error.code'), $actual->json('error.code'));
        $this->assertSame($expected->json('error.message'), $actual->json('error.message'));
        $this->assertSame($expected->headers->get('content-type'), $actual->headers->get('content-type'));
        $this->assertSame($expected->getContent(), $actual->getContent());
    }
}
