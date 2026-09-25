<?php

namespace Tests\Feature\H01;

use App\Models\Consent;
use App\Models\Course;
use App\Models\DataExport;
use App\Models\Notification;
use App\Models\Test as KnowledgeTest;
use App\Models\TestAttempt;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Pakiet H01 · Eksport RODO — kryterium 3.
 * The test queue runs sync (phpunit.xml), so the job finishes inline.
 */
class DataExportTest extends TestCase
{
    use RefreshDatabase;

    public function test_export_is_accepted_then_built_with_all_six_data_scopes(): void
    {
        Storage::fake('local');

        $user = User::factory()->create(['pesel' => '90010112349']);
        Consent::create([
            'user_id' => $user->id,
            'type' => 'polityka',
            'document_version' => 'v1',
            'granted_at' => now()->subMonth(),
        ]);
        $this->actingAs($user, 'keycloak');

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
        foreach (['profile', 'consents', 'progress', 'test_results', 'internship_entries', 'documents'] as $scope) {
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

    /**
     * Paczka osoby z podejściami do testów wiedzy zawiera
     * sekcję `test_results` z tyloma wierszami, ile ma ona podejść, a dla osoby
     * bez podejść sekcja jest pusta — a nie brakująca.
     */
    public function test_test_results_scope_lists_every_attempt_and_is_empty_without_any(): void
    {
        Storage::fake('local');

        $course = Course::create(['title' => 'Interwencja kryzysowa', 'slug' => 'test-export-interwencja']);
        $test = KnowledgeTest::create(['course_id' => $course->id, 'question_count' => 10]);

        $zdajacy = User::factory()->create();
        // 'created_at' is not in TestAttempt::$fillable, so it cannot be set through
        // create() — the same forceFill()->save() step used for InternshipEntry in
        // backend/tests/Feature/H11/InternshipTest.php sets it after the row exists.
        $starsze = now()->subDays(10);
        $nowsze = now()->subDays(3);
        $pierwsze = TestAttempt::create([
            'user_id' => $zdajacy->id,
            'test_id' => $test->id,
            'attempt_number' => 1,
            'answers' => [],
            'questions_snapshot' => [],
            'score_percent' => 60,
            'passed' => false,
        ]);
        $pierwsze->forceFill(['created_at' => $starsze])->save();
        $drugie = TestAttempt::create([
            'user_id' => $zdajacy->id,
            'test_id' => $test->id,
            'attempt_number' => 2,
            'answers' => [],
            'questions_snapshot' => [],
            'score_percent' => 90,
            'passed' => true,
        ]);
        $drugie->forceFill(['created_at' => $nowsze])->save();

        $bezPodejsc = User::factory()->create();

        $payloadZdajacej = $this->exportPayloadFor($zdajacy);
        $payloadBezPodejsc = $this->exportPayloadFor($bezPodejsc);

        $this->assertArrayHasKey('test_results', $payloadZdajacej);
        $this->assertCount(2, $payloadZdajacej['test_results']);
        $this->assertSame('Interwencja kryzysowa', $payloadZdajacej['test_results'][0]['test_name']);
        $this->assertSame($starsze->toIso8601ZuluString(), $payloadZdajacej['test_results'][0]['attempted_at']);
        $this->assertSame(60, $payloadZdajacej['test_results'][0]['score_percent']);
        $this->assertFalse($payloadZdajacej['test_results'][0]['passed']);
        $this->assertSame($nowsze->toIso8601ZuluString(), $payloadZdajacej['test_results'][1]['attempted_at']);
        $this->assertSame(90, $payloadZdajacej['test_results'][1]['score_percent']);
        $this->assertTrue($payloadZdajacej['test_results'][1]['passed']);

        $this->assertArrayHasKey('test_results', $payloadBezPodejsc, 'sekcja wyników testów brakuje zamiast być pusta');
        $this->assertSame([], $payloadBezPodejsc['test_results']);
    }

    /**
     * Builds a fresh export for the given user and returns its decoded payload.
     *
     * @return array<string, mixed>
     */
    private function exportPayloadFor(User $user): array
    {
        $this->actingAs($user, 'keycloak');

        $id = $this->postJson('/api/v1/me/exports')->json('data.id');

        return json_decode(Storage::disk('local')->get("exports/{$id}.json"), true);
    }

    public function test_export_status_can_be_polled(): void
    {
        Storage::fake('local');

        $user = User::factory()->create();
        $this->actingAs($user, 'keycloak');

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
        $this->actingAs($user, 'keycloak');

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

        $this->actingAs($stranger, 'keycloak');

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
