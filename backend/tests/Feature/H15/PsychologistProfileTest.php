<?php

namespace Tests\Feature\H15;

use App\Models\Consent;
use App\Models\PsychologistProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PsychologistProfileTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
    }

    public function test_read_before_program_completion_returns_not_eligible_without_error(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer', 'program_completed_at' => null]);

        $response = $this->actingAs($volunteer, 'sanctum')->getJson('/api/v1/psychologist-profile');

        $response->assertOk()
            ->assertJsonPath('data.eligible', false)
            ->assertJsonPath('data.status', 'draft');
    }

    public function test_graduate_reads_own_draft_profile_with_exact_field_set(): void
    {
        $graduate = User::factory()->create(['role' => 'volunteer', 'program_completed_at' => now()->subDay()]);
        PsychologistProfile::create([
            'user_id' => $graduate->id,
            'specializations' => ['wsparcie w kryzysie'],
            'approach' => 'poznawczo-behawioralny',
            'city' => 'Kraków',
            'bio' => 'Opis.',
            'status' => 'draft',
        ]);

        $response = $this->actingAs($graduate, 'sanctum')->getJson('/api/v1/psychologist-profile');

        $response->assertOk()
            ->assertJsonPath('data.eligible', true)
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.city', 'Kraków');

        $this->assertSame([
            'eligible', 'specializations', 'approach', 'city', 'bio',
            'publication_consent_granted', 'status', 'return_reason',
            'documents', 'created_at', 'updated_at',
        ], array_keys($response->json('data')));
    }

    public function test_edit_before_program_completion_is_rejected(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer', 'program_completed_at' => null]);

        $this->actingAs($volunteer, 'sanctum')
            ->patchJson('/api/v1/psychologist-profile', ['city' => 'Warszawa'])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'profile_not_eligible');

        $this->assertDatabaseMissing('psychologist_profiles', ['user_id' => $volunteer->id]);
    }

    public function test_graduate_can_edit_draft_but_not_after_submission(): void
    {
        $graduate = User::factory()->create(['role' => 'volunteer', 'program_completed_at' => now()->subDay()]);

        $this->actingAs($graduate, 'sanctum')
            ->patchJson('/api/v1/psychologist-profile', [
                'specializations' => ['wsparcie w kryzysie'],
                'approach' => 'systemowy',
                'city' => 'Gdańsk',
            ])
            ->assertOk()
            ->assertJsonPath('data.city', 'Gdańsk')
            ->assertJsonPath('data.status', 'draft');

        $this->uploadDiploma($graduate);

        $this->actingAs($graduate, 'sanctum')
            ->postJson('/api/v1/psychologist-profile/submit', ['publication_consent' => true])
            ->assertOk()
            ->assertJsonPath('data.status', 'submitted');

        $this->actingAs($graduate, 'sanctum')
            ->patchJson('/api/v1/psychologist-profile', ['city' => 'Poznań'])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'entry_locked');
    }

    public function test_submit_without_program_completion_is_rejected(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer', 'program_completed_at' => null]);

        $this->actingAs($volunteer, 'sanctum')
            ->postJson('/api/v1/psychologist-profile/submit', ['publication_consent' => true])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'profile_not_eligible');
    }

    public function test_submit_without_diploma_reports_missing_documents(): void
    {
        $graduate = User::factory()->create(['role' => 'volunteer', 'program_completed_at' => now()->subDay()]);
        PsychologistProfile::create([
            'user_id' => $graduate->id,
            'specializations' => ['wsparcie w kryzysie'],
            'approach' => 'systemowy',
            'city' => 'Gdańsk',
            'status' => 'draft',
        ]);

        $response = $this->actingAs($graduate, 'sanctum')
            ->postJson('/api/v1/psychologist-profile/submit', ['publication_consent' => true]);

        $response->assertStatus(422)
            ->assertJsonPath('error.code', 'profile_incomplete');
        $this->assertContains('documents', $response->json('error.reason.missing'));
    }

    public function test_submit_grants_publication_consent_and_locks_edits(): void
    {
        $graduate = User::factory()->create(['role' => 'volunteer', 'program_completed_at' => now()->subDay()]);
        PsychologistProfile::create([
            'user_id' => $graduate->id,
            'specializations' => ['wsparcie w kryzysie'],
            'approach' => 'systemowy',
            'city' => 'Gdańsk',
            'status' => 'draft',
        ]);
        $this->uploadDiploma($graduate);

        $this->actingAs($graduate, 'sanctum')
            ->postJson('/api/v1/psychologist-profile/submit', ['publication_consent' => true])
            ->assertOk()
            ->assertJsonPath('data.status', 'submitted')
            ->assertJsonPath('data.publication_consent_granted', true);

        $this->assertDatabaseHas('consents', [
            'user_id' => $graduate->id,
            'type' => 'publikacja_profilu',
        ]);
    }

    public function test_document_upload_locked_after_submission(): void
    {
        $graduate = User::factory()->create(['role' => 'volunteer', 'program_completed_at' => now()->subDay()]);
        PsychologistProfile::create([
            'user_id' => $graduate->id,
            'specializations' => ['wsparcie w kryzysie'],
            'approach' => 'systemowy',
            'city' => 'Gdańsk',
            'status' => 'submitted',
        ]);

        $this->actingAs($graduate, 'sanctum')
            ->postJson('/api/v1/psychologist-profile/documents', [
                'type' => 'dyplom',
                'file' => UploadedFile::fake()->create('dyplom.pdf', 100, 'application/pdf'),
            ])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'entry_locked');
    }

    public function test_document_upload_in_draft_returns_metadata_without_file_path(): void
    {
        $graduate = User::factory()->create(['role' => 'volunteer', 'program_completed_at' => now()->subDay()]);

        $response = $this->actingAs($graduate, 'sanctum')
            ->postJson('/api/v1/psychologist-profile/documents', [
                'type' => 'dyplom',
                'file' => UploadedFile::fake()->create('dyplom.pdf', 100, 'application/pdf'),
            ]);

        $response->assertCreated();
        $this->assertSame(['id', 'type', 'uploaded_at'], array_keys($response->json('data')));
    }

    public function test_withdraw_consent_after_acceptance_sets_status_withdrawn(): void
    {
        $graduate = User::factory()->create(['role' => 'volunteer', 'program_completed_at' => now()->subDay()]);
        $profile = PsychologistProfile::create([
            'user_id' => $graduate->id,
            'specializations' => ['wsparcie w kryzysie'],
            'approach' => 'systemowy',
            'city' => 'Gdańsk',
            'status' => 'accepted',
            'decided_at' => now(),
        ]);
        $consent = Consent::create([
            'user_id' => $graduate->id,
            'type' => 'publikacja_profilu',
            'granted_at' => now()->subDay(),
        ]);

        $this->actingAs($graduate, 'sanctum')
            ->postJson('/api/v1/psychologist-profile/consent/withdraw')
            ->assertOk()
            ->assertJsonPath('data.status', 'withdrawn');

        $this->assertSame('withdrawn', $profile->fresh()->status);
        $this->assertNotNull($consent->fresh()->withdrawn_at);
    }

    public function test_withdraw_consent_without_prior_grant_is_rejected(): void
    {
        $graduate = User::factory()->create(['role' => 'volunteer', 'program_completed_at' => now()->subDay()]);
        PsychologistProfile::create(['user_id' => $graduate->id, 'status' => 'draft']);

        $this->actingAs($graduate, 'sanctum')
            ->postJson('/api/v1/psychologist-profile/consent/withdraw')
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_role_other_than_volunteer_is_forbidden(): void
    {
        $admin = User::factory()->create(['role' => 'project_manager']);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/psychologist-profile')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }

    private function uploadDiploma(User $user): void
    {
        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/psychologist-profile/documents', [
                'type' => 'dyplom',
                'file' => UploadedFile::fake()->create('dyplom.pdf', 100, 'application/pdf'),
            ])
            ->assertCreated();
    }
}
