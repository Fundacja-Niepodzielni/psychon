<?php

namespace Tests\Feature\H15;

use App\Exceptions\ProfileDocumentEncryptionKeyMissingException;
use App\Models\PsychologistProfile;
use App\Models\User;
use App\Services\H15\ProfileDocumentCipher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Tests\Concerns\WithProfileDocumentEncryptionKey;
use Tests\TestCase;

/**
 * Załączniki wniosku o wpis do bazy psychologów (H15)
 * leżą na dysku zaszyfrowane. Trzy kryteria atomowe:
 *
 *   (a) plik na dysku NIE zawiera treści wejściowej,
 *   (b) odczyt (pobranie przez administrację) zwraca dokładnie treść wejściową,
 *   (c) brak klucza w konfiguracji kończy się wyjątkiem o własnej nazwie.
 */
class ProfileDocumentEncryptionTest extends TestCase
{
    use RefreshDatabase;
    use WithProfileDocumentEncryptionKey;

    /** Treść, po której świadek rozpoznaje "jawny tekst wejściowy" na dysku. */
    private const string MARKER = 'DOWOD-TRESCI-WEJSCIOWEJ-%PDF-1.4';

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
        $this->useFreshProfileDocumentEncryptionKey();
    }

    /**
     * (a) Zapis przez szyfrowanie: bajty pod `file_path` nie zawierają treści
     * wejściowej wgranego pliku.
     */
    public function test_stored_file_does_not_contain_the_uploaded_plaintext(): void
    {
        $graduate = $this->graduate();

        $response = $this->actingAs($graduate, 'keycloak')
            ->postJson('/api/v1/psychologist-profile/documents', [
                'type' => 'dyplom',
                'file' => UploadedFile::fake()->createWithContent('dyplom.pdf', self::MARKER),
            ])
            ->assertCreated();

        $document = PsychologistProfile::where('user_id', $graduate->id)->firstOrFail()
            ->documents()->whereKey($response->json('data.id'))->firstOrFail();

        $onDisk = Storage::disk('local')->get($document->file_path);

        $this->assertStringNotContainsString(
            self::MARKER,
            $onDisk,
            'plik na dysku zawiera treść wejściową w postaci jawnej — zapis nie szyfruje.',
        );
    }

    /**
     * (b) Odczyt z odszyfrowaniem: pobranie przez administrację zwraca
     * dokładnie tę samą treść, którą wgrała osoba składająca wniosek.
     */
    public function test_admin_download_returns_exactly_the_uploaded_content(): void
    {
        $graduate = $this->graduate();
        $admin = User::factory()->create(['role' => 'project_manager']);

        $upload = $this->actingAs($graduate, 'keycloak')
            ->postJson('/api/v1/psychologist-profile/documents', [
                'type' => 'dyplom',
                'file' => UploadedFile::fake()->createWithContent('dyplom.pdf', self::MARKER),
            ])
            ->assertCreated();

        $profile = PsychologistProfile::where('user_id', $graduate->id)->firstOrFail();
        $documentId = $upload->json('data.id');

        $downloadUrl = URL::temporarySignedRoute(
            'admin.profiles.documents.download',
            now()->addMinutes(15),
            ['profileId' => $profile->id, 'docId' => $documentId],
        );

        $response = $this->actingAs($admin, 'keycloak')->get($downloadUrl);

        $response->assertOk();
        $this->assertSame(self::MARKER, $response->streamedContent());
    }

    /**
     * (c) Brak klucza w konfiguracji nie kończy się generycznym błędem
     * szyfratora — kończy się wyjątkiem o własnej nazwie.
     */
    public function test_missing_encryption_key_throws_its_own_named_exception(): void
    {
        config(['profile_documents.encryption_key' => null]);

        $this->expectException(ProfileDocumentEncryptionKeyMissingException::class);

        new ProfileDocumentCipher;
    }

    /**
     * (c), noga HTTP: to samo braki widziane przez API — kod błędu nazywa
     * dokładnie tę przyczynę, nie ogólny `server_error`.
     */
    public function test_missing_encryption_key_surfaces_its_own_error_code_over_http(): void
    {
        config(['profile_documents.encryption_key' => null]);
        $graduate = $this->graduate();

        $this->actingAs($graduate, 'keycloak')
            ->postJson('/api/v1/psychologist-profile/documents', [
                'type' => 'dyplom',
                'file' => UploadedFile::fake()->createWithContent('dyplom.pdf', self::MARKER),
            ])
            ->assertStatus(500)
            ->assertJsonPath('error.code', 'profile_document_encryption_key_missing');
    }

    private function graduate(): User
    {
        return User::factory()->create(['role' => 'volunteer', 'program_completed_at' => now()->subDay()]);
    }
}
