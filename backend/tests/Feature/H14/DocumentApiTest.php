<?php

namespace Tests\Feature\H14;

use App\Models\Document;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
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
        $this->actingAs($marta, 'keycloak');

        $response = $this->getJson('/api/v1/documents');

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame('PW/2026/001', $response->json('data.0.number'));
        $this->assertNotEmpty($response->json('data.0.download_url'));
    }

    public function test_a_user_without_documents_sees_an_empty_list(): void
    {
        $filip = User::where('email', 'filip@demo.pl')->firstOrFail();
        $this->actingAs($filip, 'keycloak');

        $response = $this->getJson('/api/v1/documents');

        $response->assertOk();
        $this->assertSame([], $response->json('data'));
    }

    public function test_generate_fails_with_profile_incomplete_and_lists_missing_fields(): void
    {
        $filip = User::where('email', 'filip@demo.pl')->firstOrFail();
        $this->actingAs($filip, 'keycloak');

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
        $this->actingAs($user, 'keycloak');

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
        $this->actingAs($marta, 'keycloak');

        $response = $this->postJson('/api/v1/documents/generate', ['type' => 'certificate']);

        $response->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_repeat_generate_is_rejected_without_changing_the_document_count(): void
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $this->actingAs($marta, 'keycloak');

        $response = $this->postJson('/api/v1/documents/generate', ['type' => 'volunteer_agreement']);

        $response->assertStatus(409);
        $this->assertNotEmpty($response->json('error.reason.document_id'));
        $this->assertSame(1, Document::where('user_id', $marta->id)->count());
    }

    public function test_owner_can_download_their_document(): void
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $this->actingAs($marta, 'keycloak');
        $document = Document::where('user_id', $marta->id)->firstOrFail();

        $url = URL::temporarySignedRoute('documents.download', now()->addMinutes(15), ['document' => $document->public_id]);

        $response = $this->get($url);

        $response->assertOk();
    }

    public function test_someone_elses_document_is_not_found_even_with_a_valid_signature(): void
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $filip = User::where('email', 'filip@demo.pl')->firstOrFail();
        $document = Document::where('user_id', $marta->id)->firstOrFail();

        $this->actingAs($filip, 'keycloak');
        $url = URL::temporarySignedRoute('documents.download', now()->addMinutes(15), ['document' => $document->public_id]);

        $response = $this->get($url);

        $response->assertStatus(404)->assertJsonPath('error.code', 'not_found');
    }

    /**
     * Odpowiedź dla cudzego dokumentu nie może różnić się ani jednym bajtem
     * od odpowiedzi dla identyfikatora, którego w bazie w ogóle nie ma —
     * inaczej sama treść odpowiedzi zdradzałaby, że coś pod tym adresem
     * istnieje, tylko nie dla tej osoby.
     */
    public function test_someone_elses_document_answers_identically_to_a_nonexistent_one(): void
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $filip = User::where('email', 'filip@demo.pl')->firstOrFail();
        $document = Document::where('user_id', $marta->id)->firstOrFail();
        $this->actingAs($filip, 'keycloak');

        $foreignUrl = URL::temporarySignedRoute('documents.download', now()->addMinutes(15), ['document' => $document->public_id]);
        $foreignResponse = $this->get($foreignUrl);

        $missingUrl = URL::temporarySignedRoute('documents.download', now()->addMinutes(15), ['document' => (string) Str::uuid()]);
        $missingResponse = $this->get($missingUrl);

        $foreignResponse->assertStatus(404);
        $missingResponse->assertStatus(404);
        $this->assertSame($missingResponse->getContent(), $foreignResponse->getContent());
    }

    public function test_an_expired_signature_is_rejected(): void
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $this->actingAs($marta, 'keycloak');
        $document = Document::where('user_id', $marta->id)->firstOrFail();

        $url = URL::temporarySignedRoute('documents.download', now()->subMinutes(1), ['document' => $document->public_id]);

        $response = $this->get($url);

        $response->assertStatus(403);
    }

    public function test_a_tampered_signature_is_rejected(): void
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $this->actingAs($marta, 'keycloak');
        $document = Document::where('user_id', $marta->id)->firstOrFail();

        $url = URL::temporarySignedRoute('documents.download', now()->addMinutes(15), ['document' => $document->public_id]);
        $tampered = $url.'&tampered=1';

        $response = $this->get($tampered);

        $response->assertStatus(403);
    }

    /**
     * Dokument nie ma już pliku na dysku — powstaje w locie z zaszyfrowanej
     * migawki i trafia od razu do odpowiedzi. Pobranie nie ma więc zostawić
     * po sobie żadnego pliku, a treść ma nadal odpowiadać temu konkretnemu
     * dokumentowi (numer widoczny po rozpakowaniu strumienia PDF-a).
     */
    public function test_download_never_writes_a_file_and_content_matches_the_document_number(): void
    {
        Storage::fake('local');
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $document = Document::where('user_id', $marta->id)->firstOrFail();

        $this->actingAs($marta, 'keycloak');
        $url = URL::temporarySignedRoute('documents.download', now()->addMinutes(15), ['document' => $document->public_id]);

        $response = $this->get($url);

        $response->assertOk();
        $this->assertCount(0, Storage::disk('local')->allFiles());
        $this->assertStringContainsString($document->number, $this->extractPdfText($response->getContent()));
    }

    /**
     * Strumienie treści w PDF-ie z dompdf są skompresowane (FlateDecode),
     * więc szukanie napisu wprost w surowych bajtach nie ma sensu — trzeba
     * rozpakować każdy strumień i dopiero w nim szukać.
     */
    private function extractPdfText(string $pdf): string
    {
        preg_match_all('/stream\r?\n(.*?)endstream/s', $pdf, $matches);
        $text = '';
        foreach ($matches[1] as $stream) {
            $decoded = @gzuncompress($stream);
            if ($decoded !== false) {
                $text .= $decoded;
            }
        }

        return $text;
    }
}
