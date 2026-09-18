<?php

namespace Tests\Feature\H22;

use Database\Seeders\LegalDocumentSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pakiet H22 · kryterium L7 zlecenia — seed zwraca zaślepkę treści, nigdy
 * tekst prawny napisany przez wykonawcę.
 */
class LegalDocumentSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_seeded_regulamin_is_a_placeholder(): void
    {
        $this->seed(LegalDocumentSeeder::class);

        $this->getJson('/api/v1/legal-documents/regulamin/current')
            ->assertOk()
            ->assertJsonPath('data.content', 'Treść do dostarczenia przez Fundację.');
    }

    public function test_seeded_polityka_is_a_placeholder(): void
    {
        $this->seed(LegalDocumentSeeder::class);

        $this->getJson('/api/v1/legal-documents/polityka/current')
            ->assertOk()
            ->assertJsonPath('data.content', 'Treść do dostarczenia przez Fundację.');
    }

    public function test_seeded_klauzula_rodo_is_a_placeholder(): void
    {
        $this->seed(LegalDocumentSeeder::class);

        $this->getJson('/api/v1/legal-documents/klauzula-rodo/current')
            ->assertOk()
            ->assertJsonPath('data.content', 'Treść do dostarczenia przez Fundację.');
    }
}
