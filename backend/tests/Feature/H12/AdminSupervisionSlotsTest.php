<?php

namespace Tests\Feature\H12;

use App\Models\SupervisionSignup;
use App\Models\SupervisionSlot;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class AdminSupervisionSlotsTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_sees_all_slots_across_supervisors_with_attendance(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $supervisorOne = User::factory()->role('instructor')->create();
        $supervisorTwo = User::factory()->role('instructor')->create();
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        $slotOne = SupervisionSlot::create([
            'supervisor_id' => $supervisorOne->id,
            'starts_at' => Carbon::now()->addDay(),
            'duration_minutes' => 90,
            'seats_limit' => 3,
            'location_or_link' => 'Sala A',
        ]);
        $slotTwo = SupervisionSlot::create([
            'supervisor_id' => $supervisorTwo->id,
            'starts_at' => Carbon::now()->addDays(2),
            'duration_minutes' => 60,
            'seats_limit' => 2,
            'location_or_link' => 'Sala B',
        ]);

        $signup = SupervisionSignup::create([
            'slot_id' => $slotOne->id,
            'user_id' => $volunteer->id,
            'signed_up_at' => now(),
        ]);
        $signup->forceFill([
            'attendance' => 'present',
            'attendance_marked_by' => $supervisorOne->id,
        ])->save();

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/admin/supervision/slots')
            ->assertOk()
            ->assertJsonPath('data.0.id', $slotOne->id)
            ->assertJsonPath('data.0.supervisor.id', $supervisorOne->id)
            ->assertJsonPath('data.0.signups.0.user.id', $volunteer->id)
            ->assertJsonPath('data.0.signups.0.attendance', 'present')
            ->assertJsonPath('data.1.id', $slotTwo->id)
            ->assertJsonPath('data.1.supervisor.id', $supervisorTwo->id);
    }

    public function test_volunteer_and_instructor_are_forbidden_from_admin_slots(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer']);
        $instructor = User::factory()->role('instructor')->create();

        $this->actingAs($volunteer, 'sanctum')
            ->getJson('/api/v1/admin/supervision/slots')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');

        $this->actingAs($instructor, 'sanctum')
            ->getJson('/api/v1/admin/supervision/slots')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }
}
