<?php

namespace Tests\Feature\H13;

use App\Jobs\GenerateCertificate;
use App\Models\Certificate;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Pakiet H13 · kryterium 3 — numeracja certyfikatów per edycja. Numer nadaje
 * transakcja z blokadą wierszy edycji; unikat `certificates.number` jest twardą
 * barierą wyścigu.
 *
 * `php artisan test --filter=ConcurrentCertificate`
 */
class ConcurrentCertificateTest extends CertificatePackageCase
{
    use RefreshDatabase;

    public function test_numbers_form_a_contiguous_sequence_per_edition(): void
    {
        Storage::fake('local');

        // ola trzyma NP/2026/001 w seedzie — kolejne wydania kontynuują ciąg.
        $graduates = collect(range(1, 4))->map(fn (): int => $this->makeEligibleVolunteer()->id);

        $graduates->each(fn (int $id) => GenerateCertificate::dispatchSync($id));

        $numbers = Certificate::query()
            ->orderBy('number')
            ->pluck('number')
            ->all();

        $this->assertSame(
            ['NP/2026/001', 'NP/2026/002', 'NP/2026/003', 'NP/2026/004', 'NP/2026/005'],
            $numbers,
            'Numery certyfikatów mają dziurę lub duplikat.',
        );
    }

    public function test_unique_index_blocks_a_duplicated_number(): void
    {
        $ola = $this->ola();

        $this->expectException(QueryException::class);

        Certificate::create([
            'user_id' => $this->marta()->id,
            'edition_id' => $ola->edition_id,
            'number' => 'NP/2026/001', // już wydany oli
            'issued_at' => now(),
            'verification_token' => Str::random(40),
            'conditions_snapshot' => [],
        ]);
    }
}
