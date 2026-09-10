<?php

namespace Tests\Feature\H12;

use App\Models\AuditLogEntry;
use App\Models\InternshipEntry;
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

    public function test_instructor_group_progress_is_distinct_per_member_by_id(): void
    {
        // Świadek etapu uczestniczki: dwie osoby w TEJ SAMEJ grupie z RÓŻNYMI,
        // niezerowymi wartościami na co najmniej dwóch polach etapu — jeśli implementacja
        // policzy etap dowolnej osoby zamiast etapu WŁAŚCIWEJ osoby (np. osoby zalogowanej
        // zamiast członka grupy), wartości się zlepią i asercje poniżej padną.
        $instructor = User::factory()->role('instructor')->create();
        $otherInstructor = User::factory()->role('instructor')->create();
        $memberA = User::factory()->create(['role' => 'volunteer']);
        $memberB = User::factory()->create(['role' => 'volunteer']);
        $foreignMember = User::factory()->create(['role' => 'volunteer']);
        SupervisorAssignment::create([
            'volunteer_id' => $memberA->id,
            'supervisor_id' => $instructor->id,
            'assigned_at' => now(),
        ]);
        SupervisorAssignment::create([
            'volunteer_id' => $memberB->id,
            'supervisor_id' => $instructor->id,
            'assigned_at' => now(),
        ]);
        SupervisorAssignment::create([
            'volunteer_id' => $foreignMember->id,
            'supervisor_id' => $otherInstructor->id,
            'assigned_at' => now(),
        ]);

        // A: dwie obecności zaliczone, 3,5 h zaakceptowane.
        $slotOne = SupervisionSlot::create($this->slotData($instructor, startsAt: Carbon::now()->subDays(2)));
        $slotTwo = SupervisionSlot::create($this->slotData($instructor, startsAt: Carbon::now()->subDays(1)));
        SupervisionSignup::create([
            'slot_id' => $slotOne->id,
            'user_id' => $memberA->id,
            'signed_up_at' => Carbon::now()->subDays(3),
            'attendance' => 'present',
            'attendance_marked_by' => $instructor->id,
        ]);
        SupervisionSignup::create([
            'slot_id' => $slotTwo->id,
            'user_id' => $memberA->id,
            'signed_up_at' => Carbon::now()->subDays(2),
            'attendance' => 'present',
            'attendance_marked_by' => $instructor->id,
        ]);
        InternshipEntry::create([
            'user_id' => $memberA->id,
            'date' => Carbon::now()->subDays(1)->toDateString(),
            'hours' => '3.5',
            'form' => 'individual',
            'consultations_count' => 1,
            'description' => 'A',
            'status' => 'accepted',
        ]);

        // B: jedna obecność zaliczona, 1,5 h zaakceptowane — inne wartości niż A na obu polach.
        $slotThree = SupervisionSlot::create($this->slotData($instructor, startsAt: Carbon::now()->subHours(6)));
        SupervisionSignup::create([
            'slot_id' => $slotThree->id,
            'user_id' => $memberB->id,
            'signed_up_at' => Carbon::now()->subDays(1),
            'attendance' => 'present',
            'attendance_marked_by' => $instructor->id,
        ]);
        InternshipEntry::create([
            'user_id' => $memberB->id,
            'date' => Carbon::now()->subDays(1)->toDateString(),
            'hours' => '1.5',
            'form' => 'individual',
            'consultations_count' => 1,
            'description' => 'B',
            'status' => 'accepted',
        ]);

        $response = $this->actingAs($instructor, 'sanctum')
            ->getJson('/api/v1/instructor/group')
            ->assertOk()
            ->assertJsonCount(2, 'data.members');

        $members = collect($response->json('data.members'));
        $this->assertFalse($members->contains('id', $foreignMember->id));

        $found = $members->firstWhere('id', $memberA->id);
        $this->assertNotNull($found, 'osoba A ma być w grupie prowadzącego, niezależnie od pozycji w tablicy');
        $this->assertSame(2, $found['progress']['supervision_present']);
        $this->assertSame('3.5', $found['progress']['hours_accepted']);

        $found = $members->firstWhere('id', $memberB->id);
        $this->assertNotNull($found, 'osoba B ma być w grupie prowadzącego, niezależnie od pozycji w tablicy');
        $this->assertSame(1, $found['progress']['supervision_present']);
        $this->assertSame('1.5', $found['progress']['hours_accepted']);
    }

    public function test_instructor_can_mark_attendance_only_after_slot_ends(): void
    {
        // Obecność na terminie superwizji oznacza wyłącznie prowadzący — decyzja
        // Administracja tą trasą obecności już nie oznacza; jej odmowa
        // ma osobnego świadka niżej (test_administration_cannot_mark_attendance).
        $instructor = User::factory()->role('instructor')->create();
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

    public function test_administration_cannot_mark_attendance(): void
    {
        // Reguła: obecność oznacza prowadzący, i nikt więcej. Administracja
        // (obie role — project_manager i super_admin, kryterium mówi o administracji, nie
        // o jednej roli) nie oznacza obecności na cudzym terminie. Kształt odmowy (403)
        // zastany z trasy siostrzanej GET /api/v1/admin/supervision/slots, nie wymyślony tu.
        $instructor = User::factory()->role('instructor')->create();
        $projectManager = User::factory()->role('project_manager')->create();
        $superAdmin = User::factory()->role('super_admin')->create();
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

        $this->actingAs($projectManager, 'sanctum')
            ->patchJson("/api/v1/instructor/slots/{$pastSlot->id}/attendance", [
                'attendance' => [(string) $member->id => 'present'],
            ])
            ->assertStatus(403);

        $this->actingAs($superAdmin, 'sanctum')
            ->patchJson("/api/v1/instructor/slots/{$pastSlot->id}/attendance", [
                'attendance' => [(string) $member->id => 'present'],
            ])
            ->assertStatus(403);

        // Sama odmowa HTTP nie dowodzi, że nic nie zapisano — obecność ma zostać niezmieniona.
        $this->assertDatabaseHas('supervision_signups', [
            'slot_id' => $pastSlot->id,
            'user_id' => $member->id,
            'attendance' => null,
            'attendance_marked_by' => null,
        ]);
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
