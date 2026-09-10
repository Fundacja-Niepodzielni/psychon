<?php

namespace Tests\Feature\H12;

use App\Models\SupervisionSignup;
use App\Models\SupervisionSlot;
use App\Models\SupervisorAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Świadek dla `can_sign_up`/`can_mark_attendance`: zegar jest ustawiony przez
 * `travelTo()`, nie wyliczony z `now()` w teście — inaczej świadek zzieleniałby
 * sam z siebie za tydzień, bez sprawdzenia czegokolwiek.
 */
class SupervisionTimingFieldsWitnessTest extends TestCase
{
    use RefreshDatabase;

    public function test_participant_resource_can_sign_up_matches_signup_rule(): void
    {
        $this->travelTo(Carbon::parse('2026-09-10 11:18:00', 'UTC'));

        $supervisor = User::factory()->role('instructor')->create();
        $volunteer = User::factory()->create(['role' => 'volunteer']);
        SupervisorAssignment::create([
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $supervisor->id,
            'assigned_at' => now(),
        ]);

        $pastSlot = SupervisionSlot::create([
            'supervisor_id' => $supervisor->id,
            'starts_at' => Carbon::parse('2026-09-03 10:00:00', 'UTC'),
            'duration_minutes' => 90,
            'seats_limit' => 3,
            'location_or_link' => 'Sala demo',
        ]);
        $futureSlot = SupervisionSlot::create([
            'supervisor_id' => $supervisor->id,
            'starts_at' => Carbon::parse('2026-09-26 10:00:00', 'UTC'),
            'duration_minutes' => 90,
            'seats_limit' => 3,
            'location_or_link' => 'Sala demo',
        ]);

        $response = $this->actingAs($volunteer, 'sanctum')
            ->getJson('/api/v1/supervision/slots?per_page=25')
            ->assertOk();

        $byId = collect($response->json('data'))->keyBy('id');
        $this->assertFalse($byId[$pastSlot->id]['can_sign_up'], 'termin przeszły ma dawać can_sign_up=false');
        $this->assertTrue($byId[$futureSlot->id]['can_sign_up'], 'termin przyszły ma dawać can_sign_up=true');

        // Ten sam warunek, ten sam skutek: serwer odmawia dokładnie tam, gdzie zasób ostrzegał.
        $this->actingAs($volunteer, 'sanctum')
            ->postJson("/api/v1/supervision/slots/{$pastSlot->id}/signup")
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->travelBack();
    }

    public function test_instructor_resource_can_mark_attendance_matches_attendance_rule(): void
    {
        $this->travelTo(Carbon::parse('2026-09-10 11:18:00', 'UTC'));

        $instructor = User::factory()->role('instructor')->create();
        $member = User::factory()->create(['role' => 'volunteer']);
        SupervisorAssignment::create([
            'volunteer_id' => $member->id,
            'supervisor_id' => $instructor->id,
            'assigned_at' => now(),
        ]);

        $notEndedSlot = SupervisionSlot::create([
            'supervisor_id' => $instructor->id,
            'starts_at' => Carbon::parse('2026-09-26 10:00:00', 'UTC'),
            'duration_minutes' => 90,
            'seats_limit' => 3,
            'location_or_link' => 'Sala demo',
        ]);
        $endedSlot = SupervisionSlot::create([
            'supervisor_id' => $instructor->id,
            'starts_at' => Carbon::parse('2026-08-20 09:00:00', 'UTC'),
            'duration_minutes' => 60,
            'seats_limit' => 3,
            'location_or_link' => 'Sala demo',
        ]);
        SupervisionSignup::create([
            'slot_id' => $notEndedSlot->id,
            'user_id' => $member->id,
            'signed_up_at' => now(),
        ]);

        $response = $this->actingAs($instructor, 'sanctum')
            ->getJson('/api/v1/instructor/group')
            ->assertOk();

        $byId = collect($response->json('data.slots'))->keyBy('id');
        $this->assertFalse(
            $byId[$notEndedSlot->id]['can_mark_attendance'],
            'termin przyszły ma dawać can_mark_attendance=false',
        );
        $this->assertTrue(
            $byId[$endedSlot->id]['can_mark_attendance'],
            'termin zakończony ma dawać can_mark_attendance=true',
        );

        // Ten sam warunek, ten sam skutek po drugiej stronie: serwer odmawia oznaczenia
        // obecności na terminie, który jeszcze się nie zakończył.
        $this->actingAs($instructor, 'sanctum')
            ->patchJson("/api/v1/instructor/slots/{$notEndedSlot->id}/attendance", [
                'attendance' => [(string) $member->id => 'present'],
            ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->travelBack();
    }
}
