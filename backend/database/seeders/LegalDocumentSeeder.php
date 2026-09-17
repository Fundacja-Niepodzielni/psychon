<?php

namespace Database\Seeders;

use App\Models\LegalDocumentVersion;
use Illuminate\Database\Seeder;

/**
 * Pakiet H22 · po jednej wersji opublikowanej każdego rodzaju. Treść jest
 * wyłącznie zaślepką — dokument prawny dostarcza Fundacja, nie ten seeder.
 */
class LegalDocumentSeeder extends Seeder
{
    public function run(): void
    {
        foreach (LegalDocumentVersion::TYPES as $type) {
            LegalDocumentVersion::query()->firstOrCreate(
                ['type' => $type, 'version' => 'v1'],
                [
                    'content' => 'Treść do dostarczenia przez Fundację.',
                    'status' => LegalDocumentVersion::STATUS_PUBLISHED,
                    'published_at' => now()->subMonths(4),
                ],
            );
        }
    }
}
