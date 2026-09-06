<?php

namespace Tests\Feature\H10;

use App\Models\AuditLogEntry;
use App\Models\User;
use App\Support\ProgressAggregator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;

/**
 * Pakiet H10 · warsztat stacjonarny — kryterium 5 (odznaczenie zasila warunek
 * certyfikatu `workshop`).
 */
class WorkshopTest extends TestPackageCase
{
    use RefreshDatabase;

    public function test_marking_the_workshop_sets_the_certificate_condition(): void
    {
        $this->activeEdition();
        $admin = User::factory()->create(['role' => 'project_manager']);
        $user = $this->volunteer();

        $this->assertFalse(ProgressAggregator::for($user)['workshop_done']);

        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/admin/workshop/{$user->id}/complete")
            ->assertOk()
            ->assertJsonPath('data.workshop_done', true);

        $this->assertTrue(ProgressAggregator::for($user->fresh())['workshop_done']);

        $this->assertDatabaseHas('audit_log', [
            'action' => 'workshop.completed',
            'actor_id' => $admin->id,
            'subject_id' => $user->id,
        ]);
    }

    public function test_marking_twice_is_idempotent_and_audited_once(): void
    {
        $this->activeEdition();
        $admin = User::factory()->create(['role' => 'project_manager']);
        $user = $this->volunteer();
        Sanctum::actingAs($admin);

        $this->postJson("/api/v1/admin/workshop/{$user->id}/complete")->assertOk();
        $this->postJson("/api/v1/admin/workshop/{$user->id}/complete")->assertOk();

        $this->assertDatabaseCount('workshop_completions', 1);
        $this->assertSame(1, AuditLogEntry::where('action', 'workshop.completed')->count());
    }

    public function test_workshop_marking_is_closed_to_non_admins(): void
    {
        $this->activeEdition();
        $user = $this->volunteer();
        Sanctum::actingAs($this->volunteer());

        $this->postJson("/api/v1/admin/workshop/{$user->id}/complete")->assertStatus(403);
    }
}
