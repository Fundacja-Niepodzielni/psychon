<?php

namespace Tests\Feature\H12;

use App\Models\SupervisionSignup;
use App\Models\SupervisionSlot;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Świadek pisany z kryterium pozycji 6 („Potwierdzenie odbycia widoczne w administracji"),
 * NIE z odczytu `AdminSupervisionSlotsTest.php` — ten plik nie był otwarty przy pisaniu
 * tego świadka. Kryterium czytane z trasy (`routes/api/h12.php`), kontrolera
 * (`AdminSupervisionController`) i zasobu (`InstructorSlotResource`), nie z cudzego testu.
 *
 * Trzy nogi kryterium + odmowa dla pozostałych ról:
 *  1. widzi CUDZE terminy — dwóch różnych prowadzących w jednej odpowiedzi.
 *  2. widzi obecność KONKRETNEJ osoby — `attendance` przy zapisie konkretnego uczestnika,
 *     nie sam fakt istnienia terminu.
 *  3. odmowa dla wolontariuszki i prowadzącego.
 */
class AdminSupervisionSlotsCriterionWitnessTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_sees_slots_from_two_different_supervisors_with_named_attendance(): void
    {
        $admin = User::factory()->create(['role' => 'project_manager']);

        $supervisorA = User::factory()->create([
            'role' => 'instructor',
            'first_name' => 'Anna',
            'last_name' => 'ProwadzacaA',
        ]);
        $supervisorB = User::factory()->create([
            'role' => 'instructor',
            'first_name' => 'Bogdan',
            'last_name' => 'ProwadzacyB',
        ]);

        $slotA = SupervisionSlot::create([
            'supervisor_id' => $supervisorA->id,
            'starts_at' => Carbon::now()->subHours(2),
            'duration_minutes' => 60,
            'seats_limit' => 2,
            'location_or_link' => 'Sala A',
        ]);
        $slotB = SupervisionSlot::create([
            'supervisor_id' => $supervisorB->id,
            'starts_at' => Carbon::now()->subHours(3),
            'duration_minutes' => 60,
            'seats_limit' => 3,
            'location_or_link' => 'Sala B',
        ]);

        $participant = User::factory()->create([
            'role' => 'volunteer',
            'first_name' => 'Wera',
            'last_name' => 'Pierwsza',
        ]);
        $otherParticipant = User::factory()->create(['role' => 'volunteer']);

        SupervisionSignup::create([
            'slot_id' => $slotA->id,
            'user_id' => $participant->id,
            'signed_up_at' => Carbon::now()->subHours(2)->subMinutes(10),
            'attendance' => 'present',
            'attendance_marked_by' => $supervisorA->id,
        ]);
        SupervisionSignup::create([
            'slot_id' => $slotA->id,
            'user_id' => $otherParticipant->id,
            'signed_up_at' => Carbon::now()->subHours(2)->subMinutes(5),
            'attendance' => 'absent',
            'attendance_marked_by' => $supervisorA->id,
        ]);
        SupervisionSignup::create([
            'slot_id' => $slotB->id,
            'user_id' => $otherParticipant->id,
            'signed_up_at' => Carbon::now()->subHours(3)->subMinutes(10),
            'attendance' => null,
            'attendance_marked_by' => null,
        ]);

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/admin/supervision/slots');

        $response->assertOk();

        $supervisorIds = collect($response->json('data'))
            ->pluck('supervisor.id')
            ->all();

        // Noga 1 — widzi CUDZE terminy: dwaj różni prowadzący w jednej odpowiedzi.
        $this->assertContains($supervisorA->id, $supervisorIds);
        $this->assertContains($supervisorB->id, $supervisorIds);

        $slotAPayload = collect($response->json('data'))
            ->firstWhere('id', $slotA->id);

        $this->assertNotNull($slotAPayload, 'Termin prowadzony przez supervisorA musi być w odpowiedzi.');

        $signupForParticipant = collect($slotAPayload['signups'])
            ->first(fn (array $signup): bool => $signup['user']['id'] === $participant->id);

        // Noga 2 — widzi obecność KONKRETNEJ osoby, nie tylko fakt istnienia terminu.
        $this->assertNotNull($signupForParticipant, 'Zapis konkretnego uczestnika musi być widoczny.');
        $this->assertSame('present', $signupForParticipant['attendance']);

        $signupForOther = collect($slotAPayload['signups'])
            ->first(fn (array $signup): bool => $signup['user']['id'] === $otherParticipant->id);

        // kontrola różnicująca: dwie osoby na tym samym terminie mają różną obecność —
        // trasa nie oddaje stałej wartości.
        $this->assertNotSame($signupForParticipant['attendance'], $signupForOther['attendance']);
        $this->assertSame('absent', $signupForOther['attendance']);
    }

    public function test_volunteer_and_instructor_are_refused(): void
    {
        SupervisionSlot::create([
            'supervisor_id' => User::factory()->create(['role' => 'instructor'])->id,
            'starts_at' => Carbon::now()->addDay(),
            'duration_minutes' => 60,
            'seats_limit' => 2,
            'location_or_link' => 'Sala C',
        ]);

        $volunteer = User::factory()->create(['role' => 'volunteer']);
        $instructor = User::factory()->create(['role' => 'instructor']);

        $volunteerResponse = $this->actingAs($volunteer, 'sanctum')
            ->getJson('/api/v1/admin/supervision/slots');
        $instructorResponse = $this->actingAs($instructor, 'sanctum')
            ->getJson('/api/v1/admin/supervision/slots');

        // Zapisuję, co widzę (P-34): jeżeli trasa oddałaby 200 z pustą listą zamiast 403,
        // to jest wynik, nie błąd — poniższe asercje mierzą aktualny kod odpowiedzi, nie
        // rozstrzygają, jak ma być.
        $volunteerResponse->assertStatus(403);
        $instructorResponse->assertStatus(403);
    }
}
