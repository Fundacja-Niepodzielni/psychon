<?php

namespace Tests\Feature\H12;

use App\Models\AuditLogEntry;
use App\Models\Notification;
use App\Models\SupervisionSignup;
use App\Models\SupervisionSlot;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class AdminSupervisionSlotManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_updates_date_duration_place_and_limit_of_an_upcoming_slot(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $slot = $this->slot(Carbon::now()->addDays(2));
        $newStart = Carbon::now()->addDays(5)->setTime(17, 30)->utc();

        $this->actingAs($admin, 'keycloak')
            ->patchJson("/api/v1/admin/supervision/slots/{$slot->id}", [
                'starts_at' => $newStart->toIso8601ZuluString(),
                'duration_minutes' => 60,
                'location_or_link' => 'Sala C',
                'seats_limit' => 5,
            ])
            ->assertOk()
            ->assertJsonPath('data.id', $slot->id)
            ->assertJsonPath('data.starts_at', $newStart->toIso8601ZuluString())
            ->assertJsonPath('data.duration_minutes', 60)
            ->assertJsonPath('data.location_or_link', 'Sala C')
            ->assertJsonPath('data.seats_limit', 5)
            ->assertJsonPath('data.supervisor.id', $slot->supervisor_id);

        $this->assertSame(5, $slot->fresh()->seats_limit);
    }

    public function test_update_is_refused_for_a_slot_that_already_started(): void
    {
        $admin = User::factory()->role('super_admin')->create();
        $slot = $this->slot(Carbon::now()->subHour());

        $this->actingAs($admin, 'keycloak')
            ->patchJson("/api/v1/admin/supervision/slots/{$slot->id}", ['seats_limit' => 9])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertSame(3, $slot->fresh()->seats_limit);
    }

    public function test_update_uses_the_same_rules_as_slot_creation(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $slot = $this->slot(Carbon::now()->addDays(2));

        $this->actingAs($admin, 'keycloak')
            ->patchJson("/api/v1/admin/supervision/slots/{$slot->id}", [
                'starts_at' => Carbon::now()->subDay()->toIso8601ZuluString(),
            ])
            ->assertStatus(422)
            ->assertJsonPath('error.message', 'Termin musi rozpoczynać się w przyszłości.')
            ->assertJsonStructure(['error' => ['errors' => ['starts_at']]]);

        $this->actingAs($admin, 'keycloak')
            ->patchJson("/api/v1/admin/supervision/slots/{$slot->id}", ['seats_limit' => 0])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.seats_limit.0', 'Termin musi mieć co najmniej jedno miejsce.');
    }

    public function test_limit_cannot_drop_below_active_signups(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $slot = $this->slot(Carbon::now()->addDays(2));
        $this->signup($slot);
        $this->signup($slot);

        $this->actingAs($admin, 'keycloak')
            ->patchJson("/api/v1/admin/supervision/slots/{$slot->id}", ['seats_limit' => 1])
            ->assertStatus(422)
            ->assertJsonStructure(['error' => ['errors' => ['seats_limit']]]);

        $this->assertSame(3, $slot->fresh()->seats_limit);
    }

    public function test_cancel_notifies_signed_up_people_releases_signups_and_records_audit(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $slot = $this->slot(Carbon::now()->addDays(2));
        $first = $this->signup($slot);
        $second = $this->signup($slot);
        $gone = $this->signup($slot);
        $gone->forceFill(['cancelled_at' => now()])->save();

        $this->actingAs($admin, 'keycloak')
            ->deleteJson("/api/v1/admin/supervision/slots/{$slot->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $slot->id)
            ->assertJsonPath('data.signups_released', 2);

        $this->assertDatabaseMissing('supervision_slots', ['id' => $slot->id]);
        $this->assertSame(0, SupervisionSignup::query()->where('slot_id', $slot->id)->count());

        $notified = Notification::query()
            ->where('type', 'supervision.slot_cancelled')
            ->orderBy('user_id')
            ->pluck('user_id')
            ->all();
        $this->assertSame([$first->user_id, $second->user_id], $notified);

        $audit = AuditLogEntry::query()->where('action', 'supervision.slot_cancelled')->sole();
        $this->assertSame($admin->id, $audit->actor_id);
        $this->assertSame($slot->id, $audit->details['slot_id']);
        $this->assertSame(2, $audit->details['signups_released']);
    }

    public function test_cancel_is_refused_for_a_started_slot_and_leaves_everything_in_place(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $slot = $this->slot(Carbon::now()->subMinutes(10));
        $this->signup($slot);

        $this->actingAs($admin, 'keycloak')
            ->deleteJson("/api/v1/admin/supervision/slots/{$slot->id}")
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertDatabaseHas('supervision_slots', ['id' => $slot->id]);
        $this->assertSame(0, Notification::query()->count());
        $this->assertSame(0, AuditLogEntry::query()->where('action', 'supervision.slot_cancelled')->count());
    }

    public function test_unknown_slot_is_404_for_update_and_cancel(): void
    {
        $admin = User::factory()->role('project_manager')->create();

        $this->actingAs($admin, 'keycloak')
            ->patchJson('/api/v1/admin/supervision/slots/999999', ['seats_limit' => 4])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->actingAs($admin, 'keycloak')
            ->deleteJson('/api/v1/admin/supervision/slots/999999')
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_instructor_and_volunteer_cannot_manage_slots(): void
    {
        $slot = $this->slot(Carbon::now()->addDays(2));
        $instructor = User::query()->findOrFail($slot->supervisor_id);
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        foreach ([$instructor, $volunteer] as $user) {
            $this->actingAs($user, 'keycloak')
                ->patchJson("/api/v1/admin/supervision/slots/{$slot->id}", ['seats_limit' => 9])
                ->assertStatus(403);
            $this->actingAs($user, 'keycloak')
                ->deleteJson("/api/v1/admin/supervision/slots/{$slot->id}")
                ->assertStatus(403);
        }

        $this->assertSame(3, $slot->fresh()->seats_limit);
    }

    public function test_instructor_slot_creation_keeps_its_behaviour_through_the_shared_service(): void
    {
        $instructor = User::factory()->role('instructor')->create();

        $this->actingAs($instructor, 'keycloak')
            ->postJson('/api/v1/instructor/slots', [
                'starts_at' => Carbon::now()->subDay()->toIso8601ZuluString(),
            ])
            ->assertStatus(422)
            ->assertExactJson(['error' => [
                'status' => 422,
                'code' => 'validation_failed',
                'message' => 'Termin musi rozpoczynać się w przyszłości.',
                'errors' => ['starts_at' => ['Termin musi rozpoczynać się w przyszłości.']],
            ]]);

        $this->actingAs($instructor, 'keycloak')
            ->postJson('/api/v1/instructor/slots', [
                'starts_at' => Carbon::now()->addDays(3)->toIso8601ZuluString(),
            ])
            ->assertCreated()
            ->assertJsonPath('data.duration_minutes', 90)
            ->assertJsonPath('data.seats_limit', 3);
    }

    private function slot(Carbon $startsAt): SupervisionSlot
    {
        return SupervisionSlot::create([
            'supervisor_id' => User::factory()->role('instructor')->create()->id,
            'starts_at' => $startsAt,
            'duration_minutes' => 90,
            'seats_limit' => 3,
            'location_or_link' => 'Sala A',
        ]);
    }

    private function signup(SupervisionSlot $slot): SupervisionSignup
    {
        return SupervisionSignup::create([
            'slot_id' => $slot->id,
            'user_id' => User::factory()->create(['role' => 'volunteer'])->id,
            'signed_up_at' => now(),
        ]);
    }
}
