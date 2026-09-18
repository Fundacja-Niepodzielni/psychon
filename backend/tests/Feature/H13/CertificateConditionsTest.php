<?php

namespace Tests\Feature\H13;

use App\Models\TestAttempt;
use App\Models\User;
use App\Support\H13\CertificateConditions;
use App\Support\ProgressAggregator;
use Illuminate\Foundation\Testing\RefreshDatabase;

/**
 * Pakiet H13 · warunki ukończenia programu — minimum ★ (kryterium 1) oraz
 * zgodność liczb z resztą platformy.
 */
class CertificateConditionsTest extends CertificatePackageCase
{
    use RefreshDatabase;

    public function test_conditions_helper_reports_marta_as_not_eligible(): void
    {
        $conditions = CertificateConditions::for($this->marta());

        $this->assertFalse($conditions->eligible());

        $data = $conditions->toArray();
        $this->assertFalse($data['eligible']);
        foreach ($data['conditions'] as $condition) {
            $this->assertFalse($condition['met'], "warunek {$condition['key']} nie powinien być spełniony");
        }
    }

    public function test_conditions_helper_reports_a_graduate_as_eligible(): void
    {
        $this->assertTrue(CertificateConditions::for($this->makeEligibleVolunteer())->eligible());
        $this->assertTrue(CertificateConditions::for($this->ola())->eligible());
    }

    public function test_conditions_endpoint_matches_the_seed_for_marta(): void
    {
        $this->actingAs($this->marta(), 'keycloak');

        $this->getJson('/api/v1/certificate/conditions')
            ->assertOk()
            ->assertJsonPath('data.eligible', false)
            ->assertJsonPath('data.conditions.0.key', 'courses')
            ->assertJsonPath('data.conditions.0.done', 1)
            ->assertJsonPath('data.conditions.0.required', 10)
            ->assertJsonPath('data.conditions.1.key', 'internship')
            ->assertJsonPath('data.conditions.1.done', '41.5')
            ->assertJsonPath('data.conditions.1.required', '72')
            ->assertJsonPath('data.conditions.2.key', 'supervision')
            ->assertJsonPath('data.conditions.2.done', 5)
            ->assertJsonPath('data.conditions.2.required', 6)
            ->assertJsonPath('data.conditions.3.key', 'workshop')
            ->assertJsonPath('data.conditions.3.met', false)
            ->assertJsonMissingPath('data.conditions.3.done')
            // seed: test 1 zaliczony (90%), test 2 niezaliczony (70%) — patrz DemoSeeder::seedMartaProgress.
            ->assertJsonPath('data.passed_tests_count', 1);
    }

    public function test_conditions_endpoint_reports_a_graduate_as_eligible(): void
    {
        $this->actingAs($this->makeEligibleVolunteer(), 'keycloak');

        $this->getJson('/api/v1/certificate/conditions')
            ->assertOk()
            ->assertJsonPath('data.eligible', true)
            ->assertJsonPath('data.conditions.3.met', true);
    }

    public function test_condition_numbers_equal_the_progress_aggregator(): void
    {
        $marta = $this->marta();
        $progress = ProgressAggregator::for($marta);
        $conditions = collect(CertificateConditions::for($marta)->toArray()['conditions'])
            ->keyBy('key');

        $this->assertSame($progress['courses_done'], $conditions['courses']['done']);
        $this->assertSame($progress['courses_total'], $conditions['courses']['required']);
        $this->assertSame($progress['hours_accepted'], $conditions['internship']['done']);
        $this->assertSame($progress['supervision_present'], $conditions['supervision']['done']);
        $this->assertSame($progress['workshop_done'], $conditions['workshop']['met']);
    }

    public function test_conditions_are_closed_to_non_volunteers(): void
    {
        $this->actingAs(User::where('email', 'filip@demo.pl')->firstOrFail(), 'keycloak'); // student
        $this->getJson('/api/v1/certificate/conditions')->assertStatus(403);

        $this->actingAs(User::where('email', 'joanna@demo.pl')->firstOrFail(), 'keycloak'); // instructor
        $this->getJson('/api/v1/certificate/conditions')->assertStatus(403);
    }

    public function test_conditions_require_authentication(): void
    {
        $this->getJson('/api/v1/certificate/conditions')->assertStatus(401);
    }

    /**
     * Poz. 19 Załącznika 1: liczba zaliczonych testów osobno od `courses`.
     * Marta ma z seeda jeden zaliczony test (90%) i jeden niezaliczony (70%,
     * patrz DemoSeeder::seedMartaProgress) — dokładamy drugi zaliczony test
     * (inny niż oba powyższe, wzięty z próby Oli) i sprawdzamy 2 zaliczone
     * + 1 niezaliczony → licznik 2.
     */
    public function test_passed_tests_count_counts_distinct_tests_with_a_passing_attempt(): void
    {
        $marta = $this->marta();
        $ola = $this->ola();

        $martaTestIds = TestAttempt::where('user_id', $marta->id)->pluck('test_id');

        $extraAttempt = TestAttempt::where('user_id', $ola->id)
            ->whereNotIn('test_id', $martaTestIds)
            ->firstOrFail();

        TestAttempt::create([
            'user_id' => $marta->id,
            'test_id' => $extraAttempt->test_id,
            'attempt_number' => 1,
            'answers' => $extraAttempt->answers,
            'questions_snapshot' => $extraAttempt->questions_snapshot,
            'score_percent' => $extraAttempt->score_percent,
            'passed' => true,
        ]);

        $conditions = CertificateConditions::for($marta->fresh());

        $this->assertSame(2, $conditions->toArray()['passed_tests_count']);
    }

    /** Poz. 19: bez żadnej próby testu licznik wynosi 0, nie null. */
    public function test_passed_tests_count_is_zero_for_a_user_without_attempts(): void
    {
        $user = User::factory()->create(['role' => 'volunteer']);

        $conditions = CertificateConditions::for($user);

        $this->assertSame(0, $conditions->toArray()['passed_tests_count']);
    }
}
