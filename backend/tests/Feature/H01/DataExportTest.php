<?php

namespace Tests\Feature\H01;

use App\Models\Consent;
use App\Models\DataExport;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Pakiet H01 · Eksport RODO — kryterium 3.
 * The test queue runs sync (phpunit.xml), so the job finishes inline.
 */
class DataExportTest extends TestCase
{
    use RefreshDatabase;

    public function test_export_is_accepted_then_built_with_all_five_data_scopes(): void
    {
        Storage::fake('local');

        $user = User::factory()->create(['pesel' => '90010112349']);
        Consent::create([
            'user_id' => $user->id,
            'type' => 'polityka',
            'document_version' => 'v1',
            'granted_at' => now()->subMonth(),
        ]);
        Sanctum::actingAs($user);

        $create = $this->postJson('/api/v1/me/exports')
            ->assertStatus(202)
            ->assertJsonPath('data.status', 'queued') // contract §2 shape
            ->assertJsonStructure(['data' => ['id', 'status', 'requested_at', 'completed_at', 'download_url']]);

        $id = $create->json('data.id');
        $this->assertStringStartsWith('ex_', $id);

        // The sync queue has already run the job by now.
        $this->getJson("/api/v1/me/exports/{$id}")->assertJsonPath('data.status', 'ready');

        $path = "exports/{$id}.json";
        Storage::disk('local')->assertExists($path);

        $payload = json_decode(Storage::disk('local')->get($path), true);
        foreach (['profile', 'consents', 'progress', 'internship_entries', 'documents'] as $scope) {
            $this->assertArrayHasKey($scope, $payload, "export is missing the '{$scope}' scope");
        }
        $this->assertSame('90010112349', $payload['profile']['pesel']);
        $this->assertSame('polityka', $payload['consents'][0]['type']);

        // export.ready notification fired (contract §3.1)
        $this->assertDatabaseHas('notifications', [
            'user_id' => $user->id,
            'type' => 'export.ready',
        ]);
    }

    public function test_export_status_can_be_polled(): void
    {
        Storage::fake('local');

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $id = $this->postJson('/api/v1/me/exports')->json('data.id');

        $this->getJson("/api/v1/me/exports/{$id}")
            ->assertOk()
            ->assertJsonPath('data.id', $id)
            ->assertJsonPath('data.status', 'ready');
    }

    public function test_finished_export_downloads_as_a_json_file(): void
    {
        Storage::fake('local');

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $id = $this->postJson('/api/v1/me/exports')->json('data.id');

        $response = $this->get("/api/v1/me/exports/{$id}/download");

        $response->assertOk();
        $this->assertSame(
            "attachment; filename=moje-dane-{$id}.json",
            $response->headers->get('content-disposition'),
        );
    }

    public function test_another_users_export_is_not_found(): void
    {
        Storage::fake('local');

        $owner = User::factory()->create();
        $stranger = User::factory()->create();

        $export = DataExport::create(['user_id' => $owner->id, 'status' => 'ready', 'file_path' => 'exports/x.json']);

        Sanctum::actingAs($stranger);

        $this->getJson("/api/v1/me/exports/{$export->public_id}")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->getJson("/api/v1/me/exports/{$export->public_id}/download")
            ->assertStatus(404);
    }

    public function test_exports_require_authentication(): void
    {
        $this->postJson('/api/v1/me/exports')->assertStatus(401);
    }
}
