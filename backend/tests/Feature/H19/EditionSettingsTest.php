<?php

namespace Tests\Feature\H19;

use App\Models\AuditLogEntry;
use App\Models\Edition;
use App\Models\User;
use App\Support\Settings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Pakiet H19 · GET/PATCH /admin/edition — kryteria 2★ i 3.
 */
class EditionSettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_get_edition_returns_the_seed_defaults(): void
    {
        $this->seed();

        $admin = User::where('email', 'admin@demo.pl')->firstOrFail();
        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/admin/edition')
            ->assertOk()
            ->assertJsonPath('data.name', 'Edycja 2026')
            ->assertJsonPath('data.starts_at', '2026-10-01')
            ->assertJsonPath('data.seats_limit', 40)
            ->assertJsonPath('data.test_pass_threshold', 80)
            ->assertJsonPath('data.test_attempts_limit', 3)
            ->assertJsonPath('data.internship_hours_required', 72)
            ->assertJsonPath('data.supervision_required_count', 6)
            ->assertJsonPath('data.reliability_threshold', 60)
            ->assertJsonPath('data.lesson_completion_percent', 60);
    }

    public function test_volunteer_is_forbidden(): void
    {
        Edition::factory()->create(['status' => 'active']);
        $volunteer = User::factory()->role('volunteer')->create();
        Sanctum::actingAs($volunteer);

        $this->getJson('/api/v1/admin/edition')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }

    public function test_guest_is_unauthenticated(): void
    {
        $this->getJson('/api/v1/admin/edition')
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
    }

    public function test_threshold_above_range_is_rejected_without_changing_the_value(): void
    {
        $edition = Edition::factory()->create(['status' => 'active', 'test_pass_threshold' => 80]);
        $admin = User::factory()->role('super_admin')->create();
        Sanctum::actingAs($admin);

        $this->patchJson('/api/v1/admin/edition', ['test_pass_threshold' => 150])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['test_pass_threshold']]]);

        $this->assertSame(80, $edition->fresh()->test_pass_threshold);
        $this->assertSame(0, AuditLogEntry::where('action', 'edition.updated')->count());
    }

    public function test_valid_update_persists_and_is_audited(): void
    {
        $edition = Edition::factory()->create(['status' => 'active', 'seats_limit' => 40]);
        $admin = User::factory()->role('super_admin')->create();
        Sanctum::actingAs($admin);

        $this->patchJson('/api/v1/admin/edition', ['seats_limit' => 55])
            ->assertOk()
            ->assertJsonPath('data.seats_limit', 55);

        $this->assertSame(55, $edition->fresh()->seats_limit);

        $entry = AuditLogEntry::where('action', 'edition.updated')->firstOrFail();
        $this->assertSame($admin->id, $entry->actor_id);
        $this->assertSame($edition->id, $entry->subject_id);
        $this->assertSame(['seats_limit'], $entry->details['changed']);
    }

    public function test_updated_threshold_is_visible_immediately_through_settings(): void
    {
        Edition::factory()->create(['status' => 'active', 'test_pass_threshold' => 80]);
        $admin = User::factory()->role('super_admin')->create();
        Sanctum::actingAs($admin);

        $this->patchJson('/api/v1/admin/edition', ['test_pass_threshold' => 90])->assertOk();

        $this->assertSame(90, Settings::edition('test_pass_threshold'));
    }
}
