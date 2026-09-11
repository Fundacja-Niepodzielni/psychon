<?php

namespace Tests\Feature\H13;

use App\Models\Certificate;
use App\Models\Edition;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;

/**
 * Pakiet H13 · publiczna weryfikacja — nazwa edycji złożona wyłącznie z białych
 * znaków (np. `'   '`) jest w praktyce pusta i nie może dotrzeć do pracodawcy
 * jako puste pole; strona weryfikacji ma wtedy pokazać rok rozpoczęcia edycji,
 * tak samo jak dla nazwy `''`. Nazwa z realną treścią, choćby otoczoną spacjami
 * (`'  Edycja X '`), nadal wraca dokładnie tak, jak jest zapisana w bazie —
 * ten test nie zmienia tego zachowania.
 */
class PublicVerificationBlankEditionTest extends CertificatePackageCase
{
    use RefreshDatabase;

    public function test_verification_falls_back_to_the_year_when_edition_name_is_blank(): void
    {
        $edition = Edition::factory()->create([
            'name' => '   ',
            'starts_at' => '2026-06-01',
        ]);

        $certificate = $this->certificateFor($edition, 'NP/2026/904');

        $this->getJson("/api/v1/verify/{$certificate->number}")
            ->assertOk()
            ->assertJsonPath('data.edition', '2026');
    }

    public function test_verification_returns_the_stored_name_when_it_has_surrounding_whitespace(): void
    {
        $edition = Edition::factory()->create([
            'name' => '  Edycja X ',
            'starts_at' => '2026-07-01',
        ]);

        $certificate = $this->certificateFor($edition, 'NP/2026/905');

        $this->getJson("/api/v1/verify/{$certificate->number}")
            ->assertOk()
            ->assertJsonPath('data.edition', '  Edycja X ');
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
