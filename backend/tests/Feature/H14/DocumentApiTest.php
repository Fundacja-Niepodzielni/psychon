<?php

namespace Tests\Feature\H14;

use App\Models\Document;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DocumentApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_owner_sees_exactly_their_own_document(): void
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        Sanctum::actingAs($marta);

        $response = $this->getJson('/api/v1/documents');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame('PW/2026/001', $response->json('data.0.number'));
        $this->assertNotEmpty($response->json('data.0.download_url'));
    }

    public function test_a_user_without_documents_sees_an_empty_list(): void
    {
        $filip = User::where('email', 'filip@demo.pl')->firstOrFail();
        Sanctum::actingAs($filip);

        $response = $this->getJson('/api/v1/documents');

        $response->assertOk();
        $this->assertSame([], $response->json('data'));
    }

    public function test_generate_fails_with_profile_incomplete_and_lists_missing_fields(): void
    {
        $filip = User::where('email', 'filip@demo.pl')->firstOrFail();
        Sanctum::actingAs($filip);

        $response = $this->postJson('/api/v1/documents/generate', ['type' => 'volunteer_agreement']);

        $response->assertStatus(422)
            ->assertJsonPath('error.code', 'profile_incomplete');

        $this->assertArrayHasKey('address_street', $response->json('error.errors'));
        $this->assertArrayHasKey('address_city', $response->json('error.errors'));
        $this->assertArrayHasKey('address_zip', $response->json('error.errors'));
        $this->assertSame(0, Document::where('user_id', $filip->id)->count());
    }

    public function test_generate_succeeds_for_a_complete_profile(): void
    {
        $user = User::factory()->create([
            'edition_id' => User::where('email', 'marta@demo.pl')->firstOrFail()->edition_id,
            'phone' => '+48 600 900 900',
            'pesel' => '90010112345',
            'address_street' => 'ul. Nowa 1',
            'address_city' => 'Gdańsk',
            'address_zip' => '80-001',
        ]);
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/v1/documents/generate', ['type' => 'volunteer_agreement']);

        $response->assertCreated()
            ->assertJsonPath('data.type', 'volunteer_agreement')
            ->assertJsonPath('data.signature_status', 'none');

        $this->assertNotEmpty($response->json('data.number'));
        $this->assertNotEmpty($response->json('data.generated_at'));
        $this->assertNotEmpty($response->json('data.download_url'));
    }

    public function test_generate_rejects_an_unknown_type(): void
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        Sanctum::actingAs($marta);

        $response = $this->postJson('/api/v1/documents/generate', ['type' => 'certificate']);

        $response->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_repeat_generate_is_rejected_without_changing_the_document_count(): void
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        Sanctum::actingAs($marta);

        $response = $this->postJson('/api/v1/documents/generate', ['type' => 'volunteer_agreement']);

        $response->assertStatus(409);
        $this->assertNotEmpty($response->json('error.reason.document_id'));
        $this->assertSame(1, Document::where('user_id', $marta->id)->count());
    }

    public function test_owner_can_download_their_document(): void
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        Sanctum::actingAs($marta);
        $document = Document::where('user_id', $marta->id)->firstOrFail();

        $url = URL::temporarySignedRoute('documents.download', now()->addMinutes(15), ['document' => $document->id]);

        $response = $this->get($url);

        $response->assertOk();
    }

    public function test_someone_elses_document_is_not_found_even_with_a_valid_signature(): void
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $filip = User::where('email', 'filip@demo.pl')->firstOrFail();
        $document = Document::where('user_id', $marta->id)->firstOrFail();

        Sanctum::actingAs($filip);
        $url = URL::temporarySignedRoute('documents.download', now()->addMinutes(15), ['document' => $document->id]);

        $response = $this->get($url);

        $response->assertStatus(404)->assertJsonPath('error.code', 'not_found');
    }

    public function test_an_expired_signature_is_rejected(): void
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        Sanctum::actingAs($marta);
        $document = Document::where('user_id', $marta->id)->firstOrFail();

        $url = URL::temporarySignedRoute('documents.download', now()->subMinutes(1), ['document' => $document->id]);

        $response = $this->get($url);

        $response->assertStatus(403);
    }

    public function test_a_tampered_signature_is_rejected(): void
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        Sanctum::actingAs($marta);
        $document = Document::where('user_id', $marta->id)->firstOrFail();

        $url = URL::temporarySignedRoute('documents.download', now()->addMinutes(15), ['document' => $document->id]);
        $tampered = $url.'&tampered=1';

        $response = $this->get($tampered);

        $response->assertStatus(403);
    }

    public function test_download_reconstructs_a_missing_file_from_the_snapshot(): void
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $document = Document::where('user_id', $marta->id)->firstOrFail();

        // Seed intentionally points at a file absent from disk (design D7).
        $this->assertFalse(Storage::disk('local')->exists($document->pdf_path));

        Sanctum::actingAs($marta);
        $url = URL::temporarySignedRoute('documents.download', now()->addMinutes(15), ['document' => $document->id]);

        $response = $this->get($url);

        $response->assertOk();
        $this->assertTrue(Storage::disk('local')->exists($document->fresh()->pdf_path));
    }
}
