<?php

namespace Tests\Feature\H13;

use App\Jobs\GenerateCertificate;
use App\Models\Certificate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

/**
 * Pakiet H13 · wydanie certyfikatu — kryteria 2 (blokada braków), 5
 * (`program_completed_at`) oraz pobranie własnego pliku.
 */
class GenerateCertificateTest extends CertificatePackageCase
{
    use RefreshDatabase;

    public function test_generate_is_blocked_until_conditions_are_met(): void
    {
        $before = Certificate::count();
        Sanctum::actingAs($this->marta());

        $this->postJson('/api/v1/certificate/generate')
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'conditions_not_met')
            ->assertJsonPath('error.reason.missing', ['courses', 'internship', 'supervision', 'workshop']);

        $this->assertSame($before, Certificate::count());
    }

    public function test_generate_issues_a_certificate_for_a_graduate(): void
    {
        Storage::fake('local');
        $grad = $this->makeEligibleVolunteer();
        Sanctum::actingAs($grad);

        $this->postJson('/api/v1/certificate/generate')
            ->assertStatus(202)
            ->assertJsonPath('data.status', 'queued');

        $certificate = Certificate::where('user_id', $grad->id)->firstOrFail();

        // ola trzyma NP/2026/001 w seedzie — ten ciągnie numerację dalej.
        $this->assertSame('NP/2026/002', $certificate->number);
        $this->assertNotNull($certificate->verification_token);
        $this->assertTrue($certificate->conditions_snapshot['eligible']);
        $this->assertNotNull($grad->fresh()->program_completed_at);

        $this->assertDatabaseHas('audit_log', [
            'action' => 'certificate.issued',
            'actor_id' => $grad->id,
            'subject_id' => $certificate->id,
        ]);

        $this->assertNotNull($certificate->pdf_path);
        Storage::disk('local')->assertExists($certificate->pdf_path);
        $this->assertStringContainsString(
            $certificate->verification_token,
            Storage::disk('local')->get($certificate->pdf_path),
        );
        $this->assertStringContainsString('/certyfikat?token=', Storage::disk('local')->get($certificate->pdf_path));
    }

    public function test_generate_twice_does_not_create_a_second_certificate(): void
    {
        Storage::fake('local');
        $grad = $this->makeEligibleVolunteer();
        Sanctum::actingAs($grad);

        $this->postJson('/api/v1/certificate/generate')->assertStatus(202);
        $first = Certificate::where('user_id', $grad->id)->firstOrFail();

        $this->postJson('/api/v1/certificate/generate')->assertStatus(202);

        $this->assertSame(1, Certificate::where('user_id', $grad->id)->count());
        $this->assertSame($first->number, Certificate::where('user_id', $grad->id)->firstOrFail()->number);
    }

    public function test_issuing_lifts_the_time_boxed_access_gate(): void
    {
        Storage::fake('local');
        $grad = $this->makeEligibleVolunteer();
        $grad->update(['access_expires_at' => now()->subDay()]); // dostęp już wygasł

        Sanctum::actingAs($grad);
        // Trasa z access.active — przed wydaniem blokada.
        $this->getJson('/api/v1/certificate/conditions')->assertStatus(403)
            ->assertJsonPath('error.code', 'access_expired');

        $grad->refresh();
        GenerateCertificate::dispatchSync($grad->id);

        $this->assertNotNull($grad->fresh()->program_completed_at);
        Sanctum::actingAs($grad->fresh());
        $this->getJson('/api/v1/certificate/conditions')->assertOk();
    }

    public function test_download_returns_the_file_after_issuing(): void
    {
        Storage::fake('local');
        $grad = $this->makeEligibleVolunteer();
        Sanctum::actingAs($grad);

        $this->getJson('/api/v1/certificate/download')->assertStatus(404);

        $this->postJson('/api/v1/certificate/generate')->assertStatus(202);

        $this->get('/api/v1/certificate/download')
            ->assertOk()
            ->assertHeader('content-disposition');
    }

    public function test_generate_requires_a_volunteer(): void
    {
        Sanctum::actingAs(User::where('email', 'filip@demo.pl')->firstOrFail());
        $this->postJson('/api/v1/certificate/generate')->assertStatus(403);
    }
}
