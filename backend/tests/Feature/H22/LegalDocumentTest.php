<?php

namespace Tests\Feature\H22;

use App\Models\LegalDocumentVersion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pakiet H22 · odczyty publiczne (bez tokenu) — kryterium L2 zlecenia:
 * bieżąca wersja obu rodzajów, konkretna wersja, oraz pięć wyników 404
 * (rodzaj nieznany, wersja nieznana, szkic — na obu trasach, plus rodzaj bez
 * publikacji).
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
}
