<?php

namespace Tests\Feature\AccessExpiry;

use App\Models\AuditLogEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * H04 · POST /admin/users/{id}/extend-access — kryterium ★2: przedłużenie
 * ustawia datę i audyt (kto, komu, do kiedy).
 */
class ExtendAccessTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    public function test_extending_by_months_sets_the_date_and_audit_entry(): void
    {
        $admin = $this->actingAsRole('project_manager');
        $volunteer = User::factory()->create(['role' => 'volunteer', 'access_expires_at' => null]);

        $response = $this->postJson("/api/v1/admin/users/{$volunteer->id}/extend-access", ['months' => 6]);

        $response->assertOk();

        $volunteer->refresh();
        $this->assertNotNull($volunteer->access_expires_at);
        $this->assertTrue($volunteer->access_expires_at->isFuture());
        $response->assertJsonPath('data.access_expires_at', $volunteer->access_expires_at->toIso8601ZuluString());

        $entry = AuditLogEntry::where('action', 'access.extended')->firstOrFail();
        $this->assertSame($admin->id, $entry->actor_id); // kto
        $this->assertSame($volunteer->id, $entry->subject_id); // komu
        $this->assertSame(User::class, $entry->subject_type);
        $this->assertSame(
            $volunteer->access_expires_at->toIso8601ZuluString(),
            $entry->details['access_expires_at'], // do kiedy
        );
    }

    public function test_extending_by_months_stacks_on_top_of_a_still_future_expiry(): void
    {
        $this->actingAsRole('super_admin');
        $volunteer = User::factory()->create([
            'role' => 'volunteer',
            'access_expires_at' => now()->addMonth(),
        ]);
        $expectedBase = $volunteer->access_expires_at->copy();

        $this->postJson("/api/v1/admin/users/{$volunteer->id}/extend-access", ['months' => 1])
            ->assertOk();

        $volunteer->refresh();
        $this->assertEqualsWithDelta(
            $expectedBase->copy()->addMonth()->timestamp,
            $volunteer->access_expires_at->timestamp,
            5,
        );
    }

    public function test_extending_by_months_from_an_already_expired_date_counts_from_now(): void
    {
        $this->actingAsRole('super_admin');
        $volunteer = User::factory()->create([
            'role' => 'volunteer',
            'access_expires_at' => now()->subYear(),
        ]);

        $this->postJson("/api/v1/admin/users/{$volunteer->id}/extend-access", ['months' => 1])
            ->assertOk();

        $volunteer->refresh();
        $this->assertEqualsWithDelta(
            now()->addMonth()->timestamp,
            $volunteer->access_expires_at->timestamp,
            5,
        );
    }

    public function test_extending_with_an_explicit_until_date_sets_it_directly(): void
    {
        $this->actingAsRole('super_admin');
        $volunteer = User::factory()->create(['role' => 'volunteer']);
        $until = now()->addMonths(3)->startOfDay();

        $this->postJson("/api/v1/admin/users/{$volunteer->id}/extend-access", [
            'until' => $until->toDateString(),
        ])->assertOk();

        $volunteer->refresh();
        $this->assertSame($until->toDateString(), $volunteer->access_expires_at->toDateString());
    }

    public function test_supplying_both_months_and_until_is_rejected(): void
    {
        $this->actingAsRole('super_admin');
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        $this->postJson("/api/v1/admin/users/{$volunteer->id}/extend-access", [
            'months' => 3,
            'until' => now()->addMonth()->toDateString(),
        ])->assertStatus(422);
    }

    public function test_supplying_neither_months_nor_until_is_rejected(): void
    {
        $this->actingAsRole('super_admin');
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        $this->postJson("/api/v1/admin/users/{$volunteer->id}/extend-access", [])
            ->assertStatus(422);
    }

    public function test_unknown_user_is_not_found(): void
    {
        $this->actingAsRole('super_admin');

        $this->postJson('/api/v1/admin/users/999999/extend-access', ['months' => 1])
            ->assertStatus(404);
    }

    public function test_non_admin_roles_are_forbidden(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        foreach (['volunteer', 'student', 'instructor'] as $role) {
            $this->actingAsRole($role);

            $this->postJson("/api/v1/admin/users/{$volunteer->id}/extend-access", ['months' => 1])
                ->assertStatus(403)
                ->assertJsonPath('error.code', 'forbidden');
        }
    }

    public function test_extend_access_requires_authentication(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        $this->postJson("/api/v1/admin/users/{$volunteer->id}/extend-access", ['months' => 1])
            ->assertStatus(401);
    }
}
