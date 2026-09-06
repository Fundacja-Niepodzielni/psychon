<?php

namespace Tests\Feature\H12;

use App\Models\AuditLogEntry;
use App\Models\SupervisionSignup;
use App\Models\SupervisionSlot;
use App\Models\SupervisorAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class SupervisionTest extends TestCase
{
    use RefreshDatabase;

    public function test_volunteer_sees_only_current_supervisor_slots_and_can_signup_and_cancel(): void
    {
        $supervisor = User::factory()->role('instructor')->create();
        $otherSupervisor = User::factory()->role('instructor')->create();
        $volunteer = User::factory()->create(['role' => 'volunteer']);
        SupervisorAssignment::create([
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $supervisor->id,
            'assigned_at' => now(),
        ]);

        $ownSlot = SupervisionSlot::create($this->slotData($supervisor, seats: 2));
        SupervisionSlot::create($this->slotData($otherSupervisor));

        $this->actingAs($volunteer, 'sanctum')
            ->getJson('/api/v1/supervision/slots')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $ownSlot->id)
            ->assertJsonPath('data.0.active_signups_count', 0)
            ->assertJsonPath('data.0.available_seats', 2)
            ->assertJsonPath('data.0.signup', null);

        $this->actingAs($volunteer, 'sanctum')
            ->postJson("/api/v1/supervision/slots/{$ownSlot->id}/signup")
            ->assertCreated()
            ->assertJsonPath('data.signup.attendance', null)
            ->assertJsonPath('data.active_signups_count', 1)
            ->assertJsonPath('data.available_seats', 1);

        $this->assertDatabaseHas('supervision_signups', [
            'slot_id' => $ownSlot->id,
            'user_id' => $volunteer->id,
            'cancelled_at' => null,
        ]);

        $this->actingAs($volunteer, 'sanctum')
            ->deleteJson("/api/v1/supervision/slots/{$ownSlot->id}/signup")
            ->assertOk()
            ->assertJsonPath('data.signup', null)
            ->assertJsonPath('data.available_seats', 2);

        $this->assertDatabaseMissing('supervision_signups', [
            'slot_id' => $ownSlot->id,
            'user_id' => $volunteer->id,
            'cancelled_at' => null,
        ]);
    }

    public function test_signup_enforces_supervisor_and_capacity_and_reactivates_same_record(): void
    {
        $supervisor = User::factory()->role('instructor')->create();
        $otherSupervisor = User::factory()->role('instructor')->create();
        $volunteer = User::factory()->create(['role' => 'volunteer']);
        $otherVolunteer = User::factory()->create(['role' => 'volunteer']);
        SupervisorAssignment::create([
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $supervisor->id,
            'assigned_at' => now(),
        ]);
        SupervisorAssignment::create([
            'volunteer_id' => $otherVolunteer->id,
            'supervisor_id' => $supervisor->id,
            'assigned_at' => now(),
        ]);

        $ownSlot = SupervisionSlot::create($this->slotData($supervisor, seats: 1));
        $foreignSlot = SupervisionSlot::create($this->slotData($otherSupervisor, seats: 1));

        $this->actingAs($volunteer, 'sanctum')
            ->postJson("/api/v1/supervision/slots/{$foreignSlot->id}/signup")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'not_your_supervisor');

        $this->actingAs($volunteer, 'sanctum')
            ->postJson("/api/v1/supervision/slots/{$ownSlot->id}/signup")
            ->assertCreated();

        $original = SupervisionSignup::where('slot_id', $ownSlot->id)
            ->where('user_id', $volunteer->id)
            ->firstOrFail();
        $signedUpAt = $original->signed_up_at;

        $this->actingAs($volunteer, 'sanctum')
            ->postJson("/api/v1/supervision/slots/{$ownSlot->id}/signup")
            ->assertCreated();

        $this->assertSame($original->id, $original->fresh()->id);
        $this->assertTrue($signedUpAt->equalTo($original->fresh()->signed_up_at));

        $this->actingAs($otherVolunteer, 'sanctum')
            ->postJson("/api/v1/supervision/slots/{$ownSlot->id}/signup")
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'slot_full');

        $original->forceFill([
            'cancelled_at' => now(),
            'attendance' => 'present',
            'attendance_marked_by' => $supervisor->id,
        ])->save();
        $otherSignup = SupervisionSignup::create([
            'slot_id' => $ownSlot->id,
            'user_id' => $otherVolunteer->id,
            'signed_up_at' => now(),
        ]);

        $this->actingAs($volunteer, 'sanctum')
            ->postJson("/api/v1/supervision/slots/{$ownSlot->id}/signup")
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'slot_full');

        $otherSignup->forceFill(['cancelled_at' => now()])->save();
        $this->actingAs($volunteer, 'sanctum')
            ->postJson("/api/v1/supervision/slots/{$ownSlot->id}/signup")
            ->assertCreated();

        $this->assertDatabaseHas('supervision_signups', [
            'id' => $original->id,
            'cancelled_at' => null,
            'attendance' => null,
            'attendance_marked_by' => null,
        ]);
    }

    public function test_instructor_can_create_slot_and_see_isolated_group_with_progress(): void
    {
        $instructor = User::factory()->role('instructor')->create();
        $otherInstructor = User::factory()->role('instructor')->create();
        $member = User::factory()->create(['role' => 'volunteer']);
        $otherMember = User::factory()->create(['role' => 'volunteer']);
        SupervisorAssignment::create([
            'volunteer_id' => $member->id,
            'supervisor_id' => $instructor->id,
            'assigned_at' => now(),
        ]);
        SupervisorAssignment::create([
            'volunteer_id' => $otherMember->id,
            'supervisor_id' => $otherInstructor->id,
            'assigned_at' => now(),
        ]);
        $slot = SupervisionSlot::create($this->slotData($instructor, seats: 3));
        SupervisionSignup::create([
            'slot_id' => $slot->id,
            'user_id' => $member->id,
            'signed_up_at' => now(),
        ]);
        SupervisionSlot::create($this->slotData($otherInstructor));

        $this->actingAs($instructor, 'sanctum')
            ->getJson('/api/v1/instructor/group')
            ->assertOk()
            ->assertJsonCount(1, 'data.members')
            ->assertJsonPath('data.members.0.id', $member->id)
            ->assertJsonPath('data.members.0.progress.supervision_present', 0)
            ->assertJsonCount(1, 'data.slots')
            ->assertJsonPath('data.slots.0.id', $slot->id)
            ->assertJsonPath('data.slots.0.signups.0.user.id', $member->id);

        $created = $this->actingAs($instructor, 'sanctum')
            ->postJson('/api/v1/instructor/slots', [
                'starts_at' => Carbon::now()->addDay()->toIso8601String(),
            ]);

        $created->assertCreated()
            ->assertJsonPath('data.duration_minutes', 90)
            ->assertJsonPath('data.seats_limit', 3)
            ->assertJsonPath('data.location_or_link', null);
        $this->assertDatabaseHas('supervision_slots', [
            'id' => $created->json('data.id'),
            'supervisor_id' => $instructor->id,
            'duration_minutes' => 90,
            'seats_limit' => 3,
        ]);
    }

    public function test_instructor_and_admin_can_mark_attendance_only_after_slot_ends(): void
    {
        $instructor = User::factory()->role('instructor')->create();
        $admin = User::factory()->role('project_manager')->create();
        $member = User::factory()->create(['role' => 'volunteer']);
        SupervisorAssignment::create([
            'volunteer_id' => $member->id,
            'supervisor_id' => $instructor->id,
            'assigned_at' => now(),
        ]);
        $pastSlot = SupervisionSlot::create($this->slotData(
            $instructor,
            startsAt: Carbon::now()->subHours(2),
            duration: 60,
        ));
        SupervisionSignup::create([
            'slot_id' => $pastSlot->id,
            'user_id' => $member->id,
            'signed_up_at' => Carbon::now()->subHours(3),
        ]);

        $this->actingAs($instructor, 'sanctum')
            ->patchJson("/api/v1/instructor/slots/{$pastSlot->id}/attendance", [
                'attendance' => [(string) $member->id => 'present'],
            ])
            ->assertOk()
            ->assertJsonPath('data.signups.0.attendance', 'present');

        $this->assertDatabaseHas('supervision_signups', [
            'slot_id' => $pastSlot->id,
            'user_id' => $member->id,
            'attendance' => 'present',
            'attendance_marked_by' => $instructor->id,
        ]);

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/v1/instructor/slots/{$pastSlot->id}/attendance", [
                'attendance' => [(string) $member->id => 'absent'],
            ])
            ->assertOk();

        $this->assertDatabaseHas('supervision_signups', [
            'slot_id' => $pastSlot->id,
            'user_id' => $member->id,
            'attendance' => 'absent',
            'attendance_marked_by' => $admin->id,
        ]);

        $futureSlot = SupervisionSlot::create($this->slotData($instructor));
        SupervisionSignup::create([
            'slot_id' => $futureSlot->id,
            'user_id' => $member->id,
            'signed_up_at' => now(),
        ]);
        $this->actingAs($instructor, 'sanctum')
            ->patchJson("/api/v1/instructor/slots/{$futureSlot->id}/attendance", [
                'attendance' => [(string) $member->id => 'present'],
            ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_assignment_keeps_history_and_records_one_audit(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $first = User::factory()->role('instructor')->create();
        $second = User::factory()->role('instructor')->create();
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/v1/admin/users/{$volunteer->id}/supervisor", [
                'supervisor_id' => $first->id,
            ])
            ->assertOk();

        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/v1/admin/users/{$volunteer->id}/supervisor", [
                'supervisor_id' => $second->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.supervisor_id', $second->id)
            ->assertJsonPath('data.unassigned_at', null);

        $this->assertSame(2, SupervisorAssignment::where('volunteer_id', $volunteer->id)->count());
        $this->assertSame(1, SupervisorAssignment::where('volunteer_id', $volunteer->id)
            ->whereNull('unassigned_at')->count());
        $this->assertSame(2, AuditLogEntry::where('action', 'supervisor.assigned')->count());

        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/v1/admin/users/{$volunteer->id}/supervisor", [
                'supervisor_id' => $second->id,
            ])
            ->assertOk();

        $this->assertSame(2, SupervisorAssignment::where('volunteer_id', $volunteer->id)->count());
        $this->assertSame(2, AuditLogEntry::where('action', 'supervisor.assigned')->count());
    }

    public function test_route_authentication_and_access_are_enforced(): void
    {
        $this->getJson('/api/v1/supervision/slots')
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');

        $student = User::factory()->role('student')->create();
        $this->actingAs($student, 'sanctum')
            ->getJson('/api/v1/supervision/slots')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');

        $expired = User::factory()->create([
            'role' => 'volunteer',
            'access_expires_at' => Carbon::now()->subMinute(),
        ]);
        $this->actingAs($expired, 'sanctum')
            ->getJson('/api/v1/supervision/slots')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'access_expired');
    }

    /**
     * @return array<string, mixed>
     */
    private function slotData(
        User $supervisor,
        int $seats = 3,
        ?Carbon $startsAt = null,
        int $duration = 90,
    ): array {
        return [
            'supervisor_id' => $supervisor->id,
            'starts_at' => $startsAt ?? Carbon::now()->addDay(),
            'duration_minutes' => $duration,
            'seats_limit' => $seats,
            'location_or_link' => 'Sala demo',
        ];
    }
}
