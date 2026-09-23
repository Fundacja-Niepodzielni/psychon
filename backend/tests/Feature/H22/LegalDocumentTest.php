<?php

namespace Tests\Feature\H22;

use App\Models\AuditLogEntry;
use App\Models\Consent;
use App\Models\LegalDocumentVersion;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pakiet H22 · odczyty publiczne (bez tokenu) — kryterium L2:
 * bieżąca wersja obu rodzajów, konkretna wersja, oraz pięć wyników 404
 * (rodzaj nieznany, wersja nieznana, szkic — na obu trasach, plus rodzaj bez
 * publikacji).
 *
 * Dopisane po decyzji właściciela z 23.09.2026 (wariant A):
 * próba negatywna „co NIE jest przyjmowane" na trasie `accept()` — rodzaj
 * informacyjny (`klauzula-rodo`) dostaje `422 unknown_document_type` i nie
 * zostawia śladu w `consents`/`audit_log`, a kontrola pozytywna obok dowodzi,
 * że prawdziwa zgoda (`regulamin`) dalej przechodzi. Trasy odczytu w tym
 * pliku (wyżej) pozostają bez zmian — bramkują dalej po `TYPES`.
 */
class LegalDocumentTest extends TestCase
{
    use RefreshDatabase;

    public function test_current_version_of_regulamin_is_public(): void
    {
        LegalDocumentVersion::create([
            'type' => 'regulamin',
            'version' => 'v1',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_PUBLISHED,
            'published_at' => now()->subDay(),
        ]);

        $this->getJson('/api/v1/legal-documents/regulamin/current')
            ->assertOk()
            ->assertJsonPath('data.type', 'regulamin')
            ->assertJsonPath('data.version', 'v1')
            ->assertJsonStructure(['data' => ['type', 'version', 'content', 'published_at']]);
    }

    public function test_current_version_of_polityka_is_public(): void
    {
        LegalDocumentVersion::create([
            'type' => 'polityka',
            'version' => 'v1',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_PUBLISHED,
            'published_at' => now()->subDay(),
        ]);

        $this->getJson('/api/v1/legal-documents/polityka/current')
            ->assertOk()
            ->assertJsonPath('data.type', 'polityka')
            ->assertJsonPath('data.version', 'v1')
            ->assertJsonStructure(['data' => ['type', 'version', 'content', 'published_at']]);
    }

    public function test_current_version_of_klauzula_rodo_is_public(): void
    {
        LegalDocumentVersion::create([
            'type' => 'klauzula-rodo',
            'version' => 'v1',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_PUBLISHED,
            'published_at' => now()->subDay(),
        ]);

        $this->getJson('/api/v1/legal-documents/klauzula-rodo/current')
            ->assertOk()
            ->assertJsonPath('data.type', 'klauzula-rodo')
            ->assertJsonPath('data.version', 'v1')
            ->assertJsonStructure(['data' => ['type', 'version', 'content', 'published_at']]);
    }

    public function test_specific_published_version_is_public(): void
    {
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

        $this->getJson('/api/v1/legal-documents/regulamin/versions/v1')
            ->assertOk()
            ->assertJsonPath('data.version', 'v1');
    }

    public function test_unknown_document_type_on_current_is_not_found(): void
    {
        $this->getJson('/api/v1/legal-documents/nieznany/current')
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_unknown_document_type_on_versions_is_not_found(): void
    {
        $this->getJson('/api/v1/legal-documents/nieznany/versions/v1')
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_unknown_version_is_not_found(): void
    {
        LegalDocumentVersion::create([
            'type' => 'regulamin',
            'version' => 'v1',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_PUBLISHED,
            'published_at' => now()->subDay(),
        ]);

        $this->getJson('/api/v1/legal-documents/regulamin/versions/v9-nie-ma')
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_draft_version_is_not_reachable_by_direct_link(): void
    {
        LegalDocumentVersion::create([
            'type' => 'regulamin',
            'version' => 'szkic-1',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_DRAFT,
        ]);

        $this->getJson('/api/v1/legal-documents/regulamin/versions/szkic-1')
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_type_without_any_published_version_returns_not_found_on_current(): void
    {
        LegalDocumentVersion::create([
            'type' => 'polityka',
            'version' => 'szkic-1',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_DRAFT,
        ]);

        $this->getJson('/api/v1/legal-documents/polityka/current')
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    /**
     * K8 — próba negatywna, zasada architekta: rodzaj informacyjny
     * na trasie akceptacji dostaje ten sam błąd co rodzaj całkiem nieznany
     * i nie zostawia śladu. Brak wiersza udowodniony liczbą (przed i po
     * żądaniu), nie brakiem wyjątku — stąd liczenie `consents` i
     * `audit_log` obu stron żądania, nie tylko po.
     */
    public function test_accepting_klauzula_rodo_is_rejected_as_unknown_type_and_leaves_no_trace(): void
    {
        $user = User::factory()->create();
        LegalDocumentVersion::create([
            'type' => 'klauzula-rodo',
            'version' => 'v1',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_PUBLISHED,
            'published_at' => now()->subDay(),
        ]);
        $this->actingAs($user, 'keycloak');

        $consentsBefore = Consent::where('user_id', $user->id)->where('type', 'klauzula-rodo')->count();
        $auditBefore = AuditLogEntry::where('action', 'legal_document.accepted')->count();

        $this->postJson('/api/v1/legal-documents/klauzula-rodo/accept', ['version' => 'v1'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'unknown_document_type');

        $consentsAfter = Consent::where('user_id', $user->id)->where('type', 'klauzula-rodo')->count();
        $auditAfter = AuditLogEntry::where('action', 'legal_document.accepted')->count();

        $this->assertSame(0, $consentsBefore, 'Zanim cokolwiek się stało, nie mogło być wiersza zgody na klauzulę.');
        $this->assertSame(0, $consentsAfter, 'Odrzucona akceptacja nie mogła utworzyć wiersza consents.');
        $this->assertSame(0, $auditBefore);
        $this->assertSame($auditBefore, $auditAfter, 'Odrzucona akceptacja nie mogła zostawić wpisu audit_log.');
    }

    /**
     * K9 — kontrola pozytywna w tej samej klasie: zmiana bramki
     * w `accept()` (na zbiór zgód zamiast `TYPES`) nie zepsuła przyjmowania
     * prawdziwej zgody. Bez tej nogi K8 byłoby spełnione też przez trasę
     * zepsutą na amen (odrzucającą wszystko).
     */
    public function test_accepting_regulamin_still_creates_a_consent_row_after_the_gate_change(): void
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

        $consentsBefore = Consent::where('user_id', $user->id)->where('type', 'regulamin')->count();

        $this->postJson('/api/v1/legal-documents/regulamin/accept', ['version' => 'v1'])
            ->assertStatus(201)
            ->assertJsonPath('data.type', 'regulamin')
            ->assertJsonPath('data.document_version', 'v1');

        $consentsAfter = Consent::where('user_id', $user->id)->where('type', 'regulamin')->count();

        $this->assertSame(0, $consentsBefore);
        $this->assertSame(1, $consentsAfter);
    }
}
