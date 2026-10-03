<?php

namespace Tests\Feature\H18;

use App\Models\Certificate;
use App\Models\TestAttemptReset;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\H10\TestPackageCase;

/**
 * Konto zanonimizowane wcześniej, ale z powodami wpisanymi ręcznie wciąż w
 * rekordach (powód blokady konta, powód unieważnienia certyfikatu, powód
 * wyzerowania podejść), dostaje przy ponownej anonimizacji (`409
 * already_anonymized`) ten sam wynik co przy anonimizacji pierwszej:
 * wszystkie trzy powody są puste, a same rekordy (fakt blokady, numer i data
 * unieważnienia, wiersz wyzerowania) zostają.
 */
class AlreadyAnonymizedClearsReasonsTest extends TestPackageCase
{
    use RefreshDatabase;

    private const string MARKER = 'ZNACZNIK-PONOWNEJ-4d6e0b92';

    /**
     * Osoba z trzema powodami w rekordach.
     *
     * @return array{0: User, 1: Certificate, 2: TestAttemptReset}
     */
    private function personWithThreeReasons(string $suffix): array
    {
        $edition = $this->activeEdition();
        $test = $this->makeTest(questions: 2);

        $person = User::factory()->create(['role' => 'volunteer']);
        $person->forceFill(['status' => 'blocked', 'blocked_reason' => 'Powód blokady: '.self::MARKER])->save();

        $certificate = Certificate::create([
            'user_id' => $person->id,
            'edition_id' => $edition->id,
            'number' => 'NP/2026/9'.$suffix,
            'issued_at' => now()->subMonth(),
            'verification_token' => 'token-proby-ponownej-'.$suffix,
            'conditions_snapshot' => [],
            'revoked_at' => now()->subDay(),
            'revoked_reason' => 'Powód unieważnienia: '.self::MARKER,
        ]);

        $reset = TestAttemptReset::create([
            'test_id' => $test->id,
            'user_id' => $person->id,
            'reset_by' => null,
            'reason' => 'Powód wyzerowania: '.self::MARKER,
            'cleared' => 2,
        ]);

        return [$person, $certificate, $reset];
    }

    /**
     * @return array{blocked_reason: ?string, revoked_reason: ?string, reset_reason: ?string, revoked_at_kept: bool, cleared: int}
     */
    private function reasonsOf(User $person, Certificate $certificate, TestAttemptReset $reset): array
    {
        $certificate = Certificate::findOrFail($certificate->id);

        return [
            'blocked_reason' => $person->fresh()->blocked_reason,
            'revoked_reason' => $certificate->revoked_reason,
            'reset_reason' => TestAttemptReset::findOrFail($reset->id)->reason,
            'revoked_at_kept' => $certificate->revoked_at !== null,
            'cleared' => TestAttemptReset::findOrFail($reset->id)->cleared,
        ];
    }

    public function test_repeated_anonymisation_clears_the_three_reasons_like_the_first_one(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'super_admin']), 'keycloak');

        [$first, $firstCertificate, $firstReset] = $this->personWithThreeReasons('1');
        $this->postJson("/api/v1/admin/users/{$first->id}/anonymize")->assertOk();
        $afterFirstPass = $this->reasonsOf($first, $firstCertificate, $firstReset);

        [$earlier, $earlierCertificate, $earlierReset] = $this->personWithThreeReasons('2');
        // Konto zanonimizowane z pominięciem procedury: stan zastany, w którym
        // powody wciąż leżą w rekordach.
        $earlier->forceFill(['anonymized_at' => now()->subDay(), 'status' => 'deleted'])->save();
        $this->assertNotNull($earlier->fresh()->blocked_reason);

        $response = $this->postJson("/api/v1/admin/users/{$earlier->id}/anonymize");
        $this->assertSame(409, $response->getStatusCode(), $response->getContent());
        $response->assertJsonPath('error.code', 'already_anonymized');

        $afterRepeat = $this->reasonsOf($earlier, $earlierCertificate, $earlierReset);

        $this->assertNull($afterRepeat['blocked_reason'], 'powód blokady zostaje w koncie po ponownej anonimizacji');
        $this->assertNull($afterRepeat['revoked_reason'], 'powód unieważnienia zostaje w certyfikacie po ponownej anonimizacji');
        $this->assertNull($afterRepeat['reset_reason'], 'powód wyzerowania zostaje w rekordzie po ponownej anonimizacji');
        $this->assertTrue($afterRepeat['revoked_at_kept'], 'sam fakt unieważnienia zostaje');
        $this->assertSame(2, $afterRepeat['cleared'], 'wiersz wyzerowania zostaje');
        $this->assertSame($afterFirstPass, $afterRepeat, 'ponowna anonimizacja zostawia inny stan niż pierwsza');
        $this->assertStringNotContainsString(self::MARKER, $response->getContent());
    }
}
