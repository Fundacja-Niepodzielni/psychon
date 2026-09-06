<?php

namespace Tests\Feature\H14;

use App\Models\Edition;
use App\Models\InternshipEntry;
use App\Models\User;
use App\Services\H14\DocumentTypeGate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Unit tests of the availability rule (design D2/D3) — profile completeness
 * and the internship-hours condition, independent of HTTP.
 */
class DocumentTypeGateTest extends TestCase
{
    use RefreshDatabase;

    private Edition $edition;

    protected function setUp(): void
    {
        parent::setUp();

        $this->edition = Edition::create([
            'name' => 'Edycja testowa',
            'starts_at' => '2026-10-01',
            'ends_at' => '2027-09-30',
            'seats_limit' => 40,
            'test_pass_threshold' => 80,
            'test_attempts_limit' => 3,
            'internship_hours_required' => 72,
            'supervision_required_count' => 6,
            'reliability_threshold' => 60,
            'lesson_completion_percent' => 60,
            'status' => 'active',
        ]);
    }

    private function completeUser(array $overrides = []): User
    {
        return User::factory()->create(array_merge([
            'edition_id' => $this->edition->id,
            'first_name' => 'Test',
            'last_name' => 'Testowa',
            'phone' => '+48 600 000 000',
            'pesel' => '90010112345',
            'address_street' => 'ul. Testowa 1',
            'address_city' => 'Warszawa',
            'address_zip' => '00-001',
        ], $overrides));
    }

    public static function requiredFieldProvider(): array
    {
        return array_map(
            fn (string $field): array => [$field],
            DocumentTypeGate::REQUIRED_PROFILE_FIELDS,
        );
    }

    #[DataProvider('requiredFieldProvider')]
    public function test_each_missing_required_field_is_reported_alone(string $field): void
    {
        $user = $this->completeUser([$field => '   ']);

        $missing = DocumentTypeGate::missingProfileFields($user);

        $this->assertSame([$field], $missing);
    }

    public function test_a_complete_profile_has_no_missing_fields(): void
    {
        $user = $this->completeUser();

        $this->assertSame([], DocumentTypeGate::missingProfileFields($user));
    }

    public function test_volunteer_agreement_available_for_a_complete_profile(): void
    {
        $user = $this->completeUser();

        $state = DocumentTypeGate::for($user)['volunteer_agreement'];

        $this->assertTrue($state['available']);
        $this->assertNull($state['reason']);
    }

    public function test_internship_certificate_unavailable_below_the_hours_threshold(): void
    {
        $user = $this->completeUser();
        $this->acceptHours($user, '41.5');

        $state = DocumentTypeGate::for($user)['internship_certificate'];

        $this->assertFalse($state['available']);
        $this->assertSame('conditions_not_met', $state['reason']);
        $this->assertSame('41.5', $state['hours_accepted']);
        $this->assertSame('72', $state['hours_required']);
    }

    public function test_internship_certificate_available_once_the_threshold_is_reached(): void
    {
        $user = $this->completeUser();
        $this->acceptHours($user, '72');

        $state = DocumentTypeGate::for($user)['internship_certificate'];

        $this->assertTrue($state['available']);
    }

    public function test_unaccepted_hours_do_not_count_towards_the_threshold(): void
    {
        $user = $this->completeUser();

        InternshipEntry::create([
            'user_id' => $user->id,
            'date' => now()->subDays(10)->toDateString(),
            'hours' => '40',
            'form' => 'phone_duty',
            'consultations_count' => 10,
            'description' => 'Dyżur.',
            'status' => 'submitted',
        ]);

        InternshipEntry::create([
            'user_id' => $user->id,
            'date' => now()->subDays(5)->toDateString(),
            'hours' => '32',
            'form' => 'phone_duty',
            'consultations_count' => 8,
            'description' => 'Dyżur.',
            'status' => 'returned',
        ]);

        $state = DocumentTypeGate::for($user)['internship_certificate'];

        $this->assertFalse($state['available']);
        $this->assertSame('conditions_not_met', $state['reason']);
    }

    private function acceptHours(User $user, string $hours): void
    {
        InternshipEntry::create([
            'user_id' => $user->id,
            'date' => now()->subDays(10)->toDateString(),
            'hours' => $hours,
            'form' => 'phone_duty',
            'consultations_count' => 10,
            'description' => 'Dyżur.',
            'status' => 'accepted',
            'decided_at' => now()->subDays(9),
        ]);
    }
}
