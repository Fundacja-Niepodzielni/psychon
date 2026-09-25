<?php

namespace Tests\Feature\H15;

use App\Exceptions\ProfileDocumentEncryptionKeyMissingException;
use App\Models\PsychologistProfile;
use App\Models\User;
use App\Services\H15\ProfileDocumentCipher;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Tests\Concerns\WithProfileDocumentEncryptionKey;
use Tests\TestCase;

/**
 * Załączniki wniosku o wpis do bazy psychologów (H15)
 * leżą na dysku zaszyfrowane. Cztery kryteria atomowe:
 *
 *   (a) plik na dysku NIE zawiera treści wejściowej,
 *   (b) odczyt (pobranie przez administrację) zwraca dokładnie treść wejściową,
 *   (c) brak klucza w konfiguracji kończy się wyjątkiem o własnej nazwie,
 *   (d) zapis zależy od klucza, nie tylko od treści — inaczej (a) i (b) razem
 *       udowadnia najwyżej kodowanie, nie szyfrowanie: zwykłe kodowanie też
 *       chowa podpis pliku i też odwraca się bezstratnie, ale robi to
 *       identycznie niezależnie od klucza.
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
     * (d) Zapis zależy od klucza: ta sama treść zaszyfrowana dwoma różnymi
     * kluczami daje dwa różne zapisy, a odczyt zapisu kluczem, którym nie
     * został zaszyfrowany, NIE zwraca treści wejściowej. Kodowanie (np.
     * base64) ignoruje klucz — dałoby identyczny zapis i "poprawny" odczyt
     * niezależnie od tego, jaki klucz akurat stoi w konfiguracji.
     */
    public function test_ciphertext_depends_on_the_key_not_just_the_content(): void
    {
        $plainText = self::MARKER;

        config(['profile_documents.encryption_key' => 'base64:'.base64_encode(random_bytes(32))]);
        $cipherWithKeyA = new ProfileDocumentCipher;
        $encryptedWithKeyA = $cipherWithKeyA->encrypt($plainText);

        config(['profile_documents.encryption_key' => 'base64:'.base64_encode(random_bytes(32))]);
        $cipherWithKeyB = new ProfileDocumentCipher;
        $encryptedWithKeyB = $cipherWithKeyB->encrypt($plainText);

        $this->assertNotSame(
            $encryptedWithKeyA,
            $encryptedWithKeyB,
            'ta sama treść zaszyfrowana dwoma różnymi kluczami dała identyczny zapis na dysku — zapis nie zależy od klucza.',
        );

        try {
            $decryptedWithWrongKey = $cipherWithKeyB->decrypt($encryptedWithKeyA);
        } catch (DecryptException) {
            $decryptedWithWrongKey = null;
        }

        $this->assertNotSame(
            $plainText,
            $decryptedWithWrongKey,
            'odczyt zapisu obcym kluczem zwrócił dokładnie treść wejściową — odczyt nie zależy od klucza.',
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
        $response->assertHeader('content-type', 'application/pdf');
        $response->assertHeader('content-length', (string) strlen(self::MARKER));
    }

    /**
     * (b), dopełnienie: `Content-Type` policzony z odszyfrowanej treści,
     * nie wpisany na sztywno jako `application/pdf`. Treść bez sygnatury
     * PDF musi dać inny, prawdziwie rozpoznany typ.
     */
    public function test_admin_download_content_type_reflects_actual_decrypted_content(): void
    {
        $plainText = str_repeat('to jest zwykly tekst bez zadnej sygnatury pliku binarnego. ', 3);
        $graduate = $this->graduate();
        $admin = User::factory()->create(['role' => 'project_manager']);

        $upload = $this->actingAs($graduate, 'keycloak')
            ->postJson('/api/v1/psychologist-profile/documents', [
                'type' => 'dyplom',
                'file' => UploadedFile::fake()->createWithContent('dyplom.pdf', $plainText),
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
        $response->assertHeader('content-type', 'text/plain; charset=utf-8');
        $response->assertHeader('content-length', (string) strlen($plainText));
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
