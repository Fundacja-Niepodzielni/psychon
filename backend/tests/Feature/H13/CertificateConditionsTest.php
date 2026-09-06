<?php

namespace Tests\Feature\H13;

use App\Models\User;
use App\Support\H13\CertificateConditions;
use App\Support\ProgressAggregator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

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
        Sanctum::actingAs($this->marta());

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
            ->assertJsonMissingPath('data.conditions.3.done');
    }

    public function test_conditions_endpoint_reports_a_graduate_as_eligible(): void
    {
        Sanctum::actingAs($this->makeEligibleVolunteer());

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
        Sanctum::actingAs(User::where('email', 'filip@demo.pl')->firstOrFail()); // student
        $this->getJson('/api/v1/certificate/conditions')->assertStatus(403);

        Sanctum::actingAs(User::where('email', 'joanna@demo.pl')->firstOrFail()); // instructor
        $this->getJson('/api/v1/certificate/conditions')->assertStatus(403);
    }

    public function test_conditions_require_authentication(): void
    {
        $this->getJson('/api/v1/certificate/conditions')->assertStatus(401);
    }
}
