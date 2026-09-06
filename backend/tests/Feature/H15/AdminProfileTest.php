<?php

namespace Tests\Feature\H15;

use App\Models\AuditLogEntry;
use App\Models\Notification;
use App\Models\PsychologistProfile;
use App\Models\SensitiveAccessLogEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class AdminProfileTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
    }

    public function test_default_queue_contains_only_submitted_profiles(): void
    {
        $admin = User::factory()->create(['role' => 'project_manager']);
        $submitted = $this->submittedProfile();
        $this->withdrawnProfile();

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/profiles');

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame($submitted->id, $response->json('data.0.id'));
    }

    public function test_status_filter_returns_withdrawn_profiles(): void
    {
        $admin = User::factory()->create(['role' => 'project_manager']);
        $withdrawn = $this->withdrawnProfile();

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/profiles?status=withdrawn');

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame($withdrawn->id, $response->json('data.0.id'));
    }

    public function test_show_returns_signed_download_url_for_each_document(): void
    {
        $admin = User::factory()->create(['role' => 'project_manager']);
        $profile = $this->submittedProfile();

        $response = $this->actingAs($admin, 'sanctum')->getJson("/api/v1/admin/profiles/{$profile->id}");

        $response->assertOk();
        $this->assertNotEmpty($response->json('data.documents.0.download_url'));
    }

    public function test_document_download_creates_sensitive_access_log_entry(): void
    {
        $admin = User::factory()->create(['role' => 'project_manager']);
        $profile = $this->submittedProfile();
        $document = $profile->documents()->first();

        $url = URL::temporarySignedRoute(
            'admin.profiles.documents.download',
            now()->addMinutes(15),
            ['profileId' => $profile->id, 'docId' => $document->id],
        );

        $this->actingAs($admin, 'sanctum')->get($url)->assertOk();

        $this->assertDatabaseHas('sensitive_access_log', [
            'viewer_id' => $admin->id,
            'file_type' => 'profile_document',
            'file_id' => $document->id,
        ]);
        $this->assertDatabaseHas('audit_log', [
            'action' => 'sensitive.viewed',
            'subject_id' => $document->id,
        ]);
        $this->assertSame(1, SensitiveAccessLogEntry::count());

        $this->actingAs($admin, 'sanctum')->get($url)->assertOk();
        $this->assertSame(2, SensitiveAccessLogEntry::count());
    }

    public function test_unsigned_document_download_is_rejected(): void
    {
        $admin = User::factory()->create(['role' => 'project_manager']);
        $profile = $this->submittedProfile();
        $document = $profile->documents()->first();

        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/admin/profiles/{$profile->id}/documents/{$document->id}")
            ->assertStatus(403);
    }

    public function test_accept_sets_status_and_records_audit_and_notification(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin']);
        $profile = $this->submittedProfile();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/profiles/{$profile->id}/accept")
            ->assertOk()
            ->assertJsonPath('data.status', 'accepted');

        $this->assertDatabaseHas('audit_log', [
            'action' => 'profile.accepted',
            'subject_id' => $profile->id,
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $profile->user_id,
            'type' => 'profile.accepted',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/profiles/{$profile->id}/accept")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'entry_locked');

        $this->assertSame(1, AuditLogEntry::where('action', 'profile.accepted')->count());
        $this->assertSame(1, Notification::where('type', 'profile.accepted')->count());
    }

    public function test_return_requires_reason_and_unlocks_editing(): void
    {
        $admin = User::factory()->create(['role' => 'project_manager']);
        $profile = $this->submittedProfile();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/profiles/{$profile->id}/return", [])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/profiles/{$profile->id}/return", ['reason' => 'Uzupełnij opis doświadczenia.'])
            ->assertOk()
            ->assertJsonPath('data.status', 'returned')
            ->assertJsonPath('data.return_reason', 'Uzupełnij opis doświadczenia.');

        $this->assertDatabaseHas('audit_log', [
            'action' => 'profile.returned',
            'subject_id' => $profile->id,
        ]);

        $owner = $profile->user;
        $this->actingAs($owner, 'sanctum')
            ->patchJson('/api/v1/psychologist-profile', ['city' => 'Wrocław'])
            ->assertOk()
            ->assertJsonPath('data.status', 'returned');
    }

    public function test_non_admin_role_is_forbidden(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        $this->actingAs($volunteer, 'sanctum')
            ->getJson('/api/v1/admin/profiles')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }

    private function submittedProfile(): PsychologistProfile
    {
        $graduate = User::factory()->create(['role' => 'volunteer', 'program_completed_at' => now()->subDay()]);
        $profile = PsychologistProfile::create([
            'user_id' => $graduate->id,
            'specializations' => ['wsparcie w kryzysie'],
            'approach' => 'systemowy',
            'city' => 'Gdańsk',
            'status' => 'submitted',
        ]);
        $profile->documents()->create([
            'type' => 'dyplom',
            'file_path' => UploadedFile::fake()->create('dyplom.pdf', 100, 'application/pdf')
                ->store("profile-documents/{$profile->id}", 'local'),
            'uploaded_at' => now(),
        ]);

        return $profile;
    }

    private function withdrawnProfile(): PsychologistProfile
    {
        $graduate = User::factory()->create(['role' => 'volunteer', 'program_completed_at' => now()->subDay()]);

        return PsychologistProfile::create([
            'user_id' => $graduate->id,
            'specializations' => ['wsparcie w kryzysie'],
            'approach' => 'systemowy',
            'city' => 'Gdańsk',
            'status' => 'withdrawn',
        ]);
    }
}
