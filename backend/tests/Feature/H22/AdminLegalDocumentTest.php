<?php

namespace Tests\Feature\H22;

use App\Models\AuditLogEntry;
use App\Models\LegalDocumentVersion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * Pakiet H22 · administracja dokumentów prawnych — kryterium L3 (lista,
 * dodanie, publikacja, odmowa edycji/usunięcia opublikowanej wersji, wpis
 * audytu) i L5 (walidacja wejść, zero zmian w bazie po odmowie). Rola
 * dopuszczona do panelu: `docs/system/03-role-i-uprawnienia.md:49`
 * (wiersz „Panel: CMS kursów i lekcji" — ta sama bramka co inne panele CMS,
 * `backend/routes/api/h22.php` grupuje trasy administracji pod
 * `role:project_manager,super_admin`).
 */
class AdminLegalDocumentTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    public function test_guest_is_unauthenticated_on_the_version_list(): void
    {
        $this->getJson('/api/v1/admin/legal-documents/regulamin/versions')
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
    }

    public function test_volunteer_is_forbidden(): void
    {
        $this->actingAsRole('volunteer');

        $this->getJson('/api/v1/admin/legal-documents/regulamin/versions')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }

    public function test_student_is_forbidden(): void
    {
        $this->actingAsRole('student');

        $this->getJson('/api/v1/admin/legal-documents/regulamin/versions')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }

    public function test_project_manager_lists_versions(): void
    {
        $this->actingAsRole('project_manager');
        LegalDocumentVersion::create([
            'type' => 'regulamin',
            'version' => 'v1',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_PUBLISHED,
            'published_at' => now()->subDay(),
        ]);

        $this->getJson('/api/v1/admin/legal-documents/regulamin/versions')
            ->assertOk()
            ->assertJsonPath('data.0.version', 'v1');
    }

    public function test_super_admin_adds_a_draft_version(): void
    {
        $this->actingAsRole('super_admin');

        $response = $this->postJson('/api/v1/admin/legal-documents/regulamin/versions', [
            'version' => 'v1',
            'content' => 'Treść do dostarczenia przez Fundację.',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.version', 'v1');
        $this->assertDatabaseHas('legal_document_versions', [
            'type' => 'regulamin',
            'version' => 'v1',
            'status' => 'draft',
        ]);
    }

    public function test_draft_is_not_visible_on_the_public_route(): void
    {
        $this->actingAsRole('project_manager');
        $this->postJson('/api/v1/admin/legal-documents/regulamin/versions', [
            'version' => 'szkic-1',
            'content' => 'Treść do dostarczenia przez Fundację.',
        ])->assertStatus(201);

        $this->getJson('/api/v1/legal-documents/regulamin/versions/szkic-1')
            ->assertStatus(404);
    }

    public function test_publishing_a_draft_sets_published_at_and_records_audit(): void
    {
        $admin = $this->actingAsRole('super_admin');
        $draft = LegalDocumentVersion::create([
            'type' => 'regulamin',
            'version' => 'v2',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_DRAFT,
        ]);

        $response = $this->postJson("/api/v1/admin/legal-documents/regulamin/versions/{$draft->version}/publish");

        $response->assertOk()
            ->assertJsonPath('data.status', 'published');
        $this->assertNotNull($response->json('data.published_at'));

        $entry = AuditLogEntry::where('action', 'legal_document.published')->firstOrFail();
        $this->assertSame($admin->id, $entry->actor_id);
        $this->assertSame($draft->id, $entry->subject_id);
    }

    public function test_current_version_read_before_and_after_publication(): void
    {
        $this->actingAsRole('super_admin');
        LegalDocumentVersion::create([
            'type' => 'regulamin',
            'version' => 'v1',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_PUBLISHED,
            'published_at' => now()->subDay(),
        ]);
        LegalDocumentVersion::create([
            'type' => 'regulamin',
            'version' => 'v2',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_DRAFT,
        ]);

        $this->getJson('/api/v1/legal-documents/regulamin/current')
            ->assertJsonPath('data.version', 'v1');

        $this->postJson('/api/v1/admin/legal-documents/regulamin/versions/v2/publish')
            ->assertOk();

        $this->getJson('/api/v1/legal-documents/regulamin/current')
            ->assertJsonPath('data.version', 'v2');
    }

    public function test_editing_a_published_version_is_refused_and_unchanged(): void
    {
        $this->actingAsRole('super_admin');
        $published = LegalDocumentVersion::create([
            'type' => 'regulamin',
            'version' => 'v1',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_PUBLISHED,
            'published_at' => now()->subDay(),
        ]);

        $this->patchJson('/api/v1/admin/legal-documents/regulamin/versions/v1', [
            'content' => 'Próba podmiany treści już opublikowanej.',
        ])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'version_locked');

        $this->assertSame(
            'Treść do dostarczenia przez Fundację.',
            $published->fresh()->content,
        );
    }

    public function test_deleting_a_published_version_is_refused_and_row_remains(): void
    {
        $this->actingAsRole('super_admin');
        LegalDocumentVersion::create([
            'type' => 'regulamin',
            'version' => 'v1',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_PUBLISHED,
            'published_at' => now()->subDay(),
        ]);

        $this->deleteJson('/api/v1/admin/legal-documents/regulamin/versions/v1')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'version_locked');

        $this->assertDatabaseHas('legal_document_versions', ['type' => 'regulamin', 'version' => 'v1']);
    }

    public function test_editing_a_draft_version_succeeds(): void
    {
        $this->actingAsRole('super_admin');
        LegalDocumentVersion::create([
            'type' => 'regulamin',
            'version' => 'szkic',
            'content' => 'Stara treść.',
            'status' => LegalDocumentVersion::STATUS_DRAFT,
        ]);

        $this->patchJson('/api/v1/admin/legal-documents/regulamin/versions/szkic', [
            'content' => 'Nowa treść szkicu.',
        ])
            ->assertOk()
            ->assertJsonPath('data.content', 'Nowa treść szkicu.');
    }

    public function test_deleting_a_draft_version_succeeds(): void
    {
        $this->actingAsRole('super_admin');
        LegalDocumentVersion::create([
            'type' => 'regulamin',
            'version' => 'szkic',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_DRAFT,
        ]);

        $this->deleteJson('/api/v1/admin/legal-documents/regulamin/versions/szkic')
            ->assertOk();

        $this->assertDatabaseMissing('legal_document_versions', ['type' => 'regulamin', 'version' => 'szkic']);
    }

    public function test_missing_content_is_rejected_and_nothing_is_stored(): void
    {
        $this->actingAsRole('super_admin');

        $this->postJson('/api/v1/admin/legal-documents/regulamin/versions', [
            'version' => 'v9',
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertDatabaseMissing('legal_document_versions', ['type' => 'regulamin', 'version' => 'v9']);
    }

    /** Limit treści (20000 znaków) — kryterium L5 zlecenia. */
    public function test_content_over_the_limit_is_rejected(): void
    {
        $this->actingAsRole('super_admin');
        $before = LegalDocumentVersion::count();

        $this->postJson('/api/v1/admin/legal-documents/regulamin/versions', [
            'version' => 'v9',
            'content' => str_repeat('a', 20001),
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertSame($before, LegalDocumentVersion::count());
    }

    public function test_version_label_longer_than_32_characters_is_rejected(): void
    {
        $this->actingAsRole('super_admin');
        $before = LegalDocumentVersion::count();

        $this->postJson('/api/v1/admin/legal-documents/regulamin/versions', [
            'version' => str_repeat('v', 33),
            'content' => 'Treść do dostarczenia przez Fundację.',
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertSame($before, LegalDocumentVersion::count());
    }

    public function test_duplicate_version_label_within_the_same_type_is_rejected(): void
    {
        $this->actingAsRole('super_admin');
        LegalDocumentVersion::create([
            'type' => 'regulamin',
            'version' => 'v1',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_PUBLISHED,
            'published_at' => now()->subDay(),
        ]);
        $before = LegalDocumentVersion::count();

        $this->postJson('/api/v1/admin/legal-documents/regulamin/versions', [
            'version' => 'v1',
            'content' => 'Inna treść, ta sama etykieta wersji.',
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertSame($before, LegalDocumentVersion::count());
    }

    /** Ta sama etykieta wersji w innym rodzaju dokumentu nie jest duplikatem. */
    public function test_same_version_label_in_a_different_type_is_allowed(): void
    {
        $this->actingAsRole('super_admin');
        LegalDocumentVersion::create([
            'type' => 'regulamin',
            'version' => 'v1',
            'content' => 'Treść do dostarczenia przez Fundację.',
            'status' => LegalDocumentVersion::STATUS_PUBLISHED,
            'published_at' => now()->subDay(),
        ]);

        $this->postJson('/api/v1/admin/legal-documents/polityka/versions', [
            'version' => 'v1',
            'content' => 'Treść do dostarczenia przez Fundację.',
        ])->assertStatus(201);
    }
}
