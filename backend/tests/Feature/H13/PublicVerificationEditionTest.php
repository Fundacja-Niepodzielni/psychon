<?php

namespace Tests\Feature\H13;

use App\Models\Certificate;
use App\Models\Edition;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;

/**
 * Pakiet H13 · publiczna weryfikacja — umowa (Zał. 1, pozycja „Dokumenty"):
 * strona weryfikacji ma potwierdzać „numer, status i edycję". `data.edition`
 * ma nieść NAZWĘ edycji (`Edition::name`), nie rok wydania certyfikatu — dwie
 * edycje w tym samym roku dzielą rok, ale mają różne nazwy.
 */
class PublicVerificationEditionTest extends CertificatePackageCase
{
    use RefreshDatabase;

    public function test_verification_reports_the_edition_name_not_the_year(): void
    {
        $editionA = Edition::factory()->create([
            'name' => 'EDYCJA-TESTOWA-A',
            'starts_at' => '2026-02-01',
        ]);
        $editionB = Edition::factory()->create([
            'name' => 'EDYCJA-TESTOWA-B',
            'starts_at' => '2026-09-01',
        ]);

        $certificateA = $this->certificateFor($editionA, 'NP/2026/901');
        $certificateB = $this->certificateFor($editionB, 'NP/2026/902');

        $responseA = $this->getJson("/api/v1/verify/{$certificateA->number}")
            ->assertOk();
        $responseB = $this->getJson("/api/v1/verify/{$certificateB->number}")
            ->assertOk();

        $responseA->assertJsonPath('data.edition', 'EDYCJA-TESTOWA-A');
        $responseB->assertJsonPath('data.edition', 'EDYCJA-TESTOWA-B');

        $this->assertNotSame(
            $responseA->json('data.edition'),
            $responseB->json('data.edition'),
            'Dwie edycje tego samego roku muszą zwracać różne wartości data.edition — inaczej strona '
            .'weryfikacji potwierdza rok, nie edycję (wymóg umowny „numer, status i edycja").',
        );
    }

    public function test_verification_falls_back_to_the_year_when_edition_name_is_empty(): void
    {
        // Pusta nazwa edycji nie jest tu blokowana walidacją — odwrót na rok jest jedyną
        // obroną, jakiej to miejsce potrzebuje na publicznej stronie weryfikacji.
        $edition = Edition::factory()->create([
            'name' => '',
            'starts_at' => '2026-05-01',
        ]);

        $certificate = $this->certificateFor($edition, 'NP/2026/903');

        $this->getJson("/api/v1/verify/{$certificate->number}")
            ->assertOk()
            ->assertJsonPath('data.edition', '2026');
    }

    private function certificateFor(Edition $edition, string $number): Certificate
    {
        $user = User::factory()->create(['edition_id' => $edition->id]);

        return Certificate::create([
            'user_id' => $user->id,
            'edition_id' => $edition->id,
            'number' => $number,
            'issued_at' => now(),
            'verification_token' => Str::random(40),
            'conditions_snapshot' => [],
        ]);
    }
}
