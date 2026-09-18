<?php

namespace Tests\Feature\H22;

use App\Models\AuditLogEntry;
use App\Models\Consent;
use App\Models\LegalDocumentVersion;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pakiet H22 · akceptacja bieżącej wersji dokumentu prawnego — kryterium L4
 * zlecenia (`POST /legal-documents/{type}/accept`), oraz odbicie stanu na
 * profilu (`legal_documents_pending_acceptance`, `ProfileResource`).
 */
class LegalDocumentAcceptanceTest extends TestCase
{
    use RefreshDatabase;

    public function test_accepting_the_current_version_creates_a_consent_row(): void
    {
        $user = User::factory()->create();
        LegalDocumentVersion::create([
            'type' => 'regulamin',
            'version' => 'v1',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_PUBLISHED,
            'published_at' => now()->subDay(),
        ]);
        $this->actingAs($user, 'keycloak');

        $this->postJson('/api/v1/legal-documents/regulamin/accept', ['version' => 'v1'])
            ->assertStatus(201)
            ->assertJsonPath('data.type', 'regulamin')
            ->assertJsonPath('data.document_version', 'v1');

        $this->assertDatabaseHas('consents', [
            'user_id' => $user->id,
            'type' => 'regulamin',
            'document_version' => 'v1',
        ]);
    }

    public function test_repeated_acceptance_of_the_same_version_does_not_duplicate(): void
    {
        $user = User::factory()->create();
        LegalDocumentVersion::create([
            'type' => 'regulamin',
            'version' => 'v1',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_PUBLISHED,
            'published_at' => now()->subDay(),
        ]);
        $this->actingAs($user, 'keycloak');

        $this->postJson('/api/v1/legal-documents/regulamin/accept', ['version' => 'v1'])
            ->assertStatus(201);
        $this->postJson('/api/v1/legal-documents/regulamin/accept', ['version' => 'v1'])
            ->assertStatus(200);

        $this->assertSame(
            1,
            Consent::where('user_id', $user->id)->where('type', 'regulamin')->count(),
        );
    }

    public function test_accepting_a_non_current_version_is_rejected(): void
    {
        $user = User::factory()->create();
        LegalDocumentVersion::create([
            'type' => 'regulamin',
            'version' => 'v1',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_PUBLISHED,
            'published_at' => now()->subMonths(2),
        ]);
        LegalDocumentVersion::create([
            'type' => 'regulamin',
            'version' => 'v2',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_PUBLISHED,
            'published_at' => now()->subDay(),
        ]);
        $this->actingAs($user, 'keycloak');

        $this->postJson('/api/v1/legal-documents/regulamin/accept', ['version' => 'v1'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'document_version_not_current');

        $this->assertDatabaseMissing('consents', ['user_id' => $user->id, 'document_version' => 'v1']);
    }

    public function test_unknown_document_type_is_rejected(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'keycloak');

        $this->postJson('/api/v1/legal-documents/nieznany/accept', ['version' => 'v1'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'unknown_document_type');
    }

    public function test_guest_is_unauthenticated(): void
    {
        LegalDocumentVersion::create([
            'type' => 'regulamin',
            'version' => 'v1',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_PUBLISHED,
            'published_at' => now()->subDay(),
        ]);

        $this->postJson('/api/v1/legal-documents/regulamin/accept', ['version' => 'v1'])
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
    }

    public function test_accepting_records_an_audit_entry(): void
    {
        $user = User::factory()->create();
        LegalDocumentVersion::create([
            'type' => 'regulamin',
            'version' => 'v1',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_PUBLISHED,
            'published_at' => now()->subDay(),
        ]);
        $this->actingAs($user, 'keycloak');

        $this->postJson('/api/v1/legal-documents/regulamin/accept', ['version' => 'v1'])
            ->assertStatus(201);

        $entry = AuditLogEntry::where('action', 'legal_document.accepted')->firstOrFail();
        $this->assertSame($user->id, $entry->actor_id);
    }

    /**
     * Profil pokazuje rodzaj jako oczekujący akceptacji dopiero po
     * publikacji nowej wersji, a przestaje po akceptacji — sprawdzone dla
     * obu rodzajów dokumentu (pomiar przed/po publikacji i przed/po akceptacji).
     */
    public function test_profile_reflects_pending_acceptance_before_and_after_publication_and_consent(): void
    {
        $user = User::factory()->create();
        $regulamin = LegalDocumentVersion::create([
            'type' => 'regulamin',
            'version' => 'v1',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_PUBLISHED,
            'published_at' => now()->subMonths(2),
        ]);
        $polityka = LegalDocumentVersion::create([
            'type' => 'polityka',
            'version' => 'v1',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_PUBLISHED,
            'published_at' => now()->subMonths(2),
        ]);
        $this->actingAs($user, 'keycloak');

        // Przed akceptacją obu rodzajów — oba oczekujące.
        $before = $this->getJson('/api/v1/me')->json('data.legal_documents_pending_acceptance');
        $this->assertContains('regulamin', $before);
        $this->assertContains('polityka', $before);

        $this->postJson('/api/v1/legal-documents/regulamin/accept', ['version' => 'v1'])->assertStatus(201);
        $this->postJson('/api/v1/legal-documents/polityka/accept', ['version' => 'v1'])->assertStatus(201);

        // Po akceptacji obu — żaden nie jest już oczekujący.
        $afterAcceptance = $this->getJson('/api/v1/me')->json('data.legal_documents_pending_acceptance');
        $this->assertSame([], $afterAcceptance);

        // Publikacja nowej wersji regulaminu przywraca go na listę oczekujących,
        // polityka pozostaje zaakceptowana.
        LegalDocumentVersion::create([
            'type' => 'regulamin',
            'version' => 'v2',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_PUBLISHED,
            'published_at' => now(),
        ]);

        $afterPublication = $this->getJson('/api/v1/me')->json('data.legal_documents_pending_acceptance');
        $this->assertContains('regulamin', $afterPublication);
        $this->assertNotContains('polityka', $afterPublication);
    }
}
