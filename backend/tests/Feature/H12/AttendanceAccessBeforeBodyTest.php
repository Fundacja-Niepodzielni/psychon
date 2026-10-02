<?php

namespace Tests\Feature\H12;

use App\Models\SupervisionSignup;
use App\Models\SupervisionSlot;
use App\Models\SupervisorAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * `PATCH /instructor/slots/{id}/attendance`: dostęp do terminu jest sprawdzany
 * PRZED treścią żądania. Termin cudzy i termin nieistniejący dają tę samą
 * odpowiedź bajt w bajt (status, kod, zdanie, ciało) — przy pustym,
 * niepoprawnym i poprawnym ciele. Walidacja ciała (422) dotyczy wyłącznie
 * terminu, do którego prowadzący ma dostęp. Administracja zachowuje
 * dotychczasową odpowiedź tej trasy (403 `forbidden`, bez zapisu).
 */
class AttendanceAccessBeforeBodyTest extends TestCase
{
    use RefreshDatabase;

    private const MISSING_ID = 999999;

    private User $instructor;

    private User $otherInstructor;

    private User $otherMember;

    private SupervisionSlot $foreignSlot;

    private SupervisionSignup $foreignSignup;

    protected function setUp(): void
    {
        parent::setUp();

        $this->instructor = User::factory()->role('instructor')->create();
        $this->otherInstructor = User::factory()->role('instructor')->create();
        $this->otherMember = User::factory()->create(['role' => 'volunteer']);
        SupervisorAssignment::create([
            'volunteer_id' => $this->otherMember->id,
            'supervisor_id' => $this->otherInstructor->id,
            'assigned_at' => now(),
        ]);
        // Termin zakończony: gdyby dostęp przeszedł, poprawne ciało zapisałoby obecność.
        $this->foreignSlot = SupervisionSlot::create([
            'supervisor_id' => $this->otherInstructor->id,
            'starts_at' => Carbon::now()->subDays(2),
            'duration_minutes' => 90,
            'seats_limit' => 3,
        ]);
        $this->foreignSignup = SupervisionSignup::create([
            'slot_id' => $this->foreignSlot->id,
            'user_id' => $this->otherMember->id,
            'signed_up_at' => Carbon::now()->subDays(3),
        ]);
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private function bodies(): array
    {
        return [
            'puste' => [],
            'niepoprawne' => ['attendance' => 'zle'],
            'poprawne' => ['attendance' => [(string) $this->otherMember->id => 'present']],
        ];
    }

    /**
     * @param  array<string, mixed>  $body
     */
    private function markAttendance(User $actor, int $slotId, array $body): TestResponse
    {
        return $this->actingAs($actor, 'keycloak')
            ->patchJson("/api/v1/instructor/slots/{$slotId}/attendance", $body);
    }

    private function assertNothingWritten(): void
    {
        $fresh = $this->foreignSignup->fresh();
        $this->assertNull($fresh->attendance);
        $this->assertNull($fresh->attendance_marked_by);
    }

    public function test_missing_slot_gives_one_404_for_empty_invalid_and_valid_body(): void
    {
        $reference = null;
        foreach ($this->bodies() as $name => $body) {
            $response = $this->markAttendance($this->instructor, self::MISSING_ID, $body);

            $this->assertSame(404, $response->status(), "nieistniejący termin, ciało {$name}");
            $response->assertJsonPath('error.code', 'not_found');
            $response->assertJsonPath('error.message', 'Nie znaleziono terminu.');
            $reference ??= $response->getContent();
            $this->assertSame($reference, $response->getContent(), "nieistniejący termin, ciało {$name}");
        }
    }

    public function test_foreign_slot_with_empty_body_is_the_missing_slot_404(): void
    {
        $missing = $this->markAttendance($this->instructor, self::MISSING_ID, []);
        $foreign = $this->markAttendance($this->instructor, $this->foreignSlot->id, []);

        $this->assertSame(404, $foreign->status());
        $this->assertSame($missing->status(), $foreign->status());
        $this->assertSame($missing->getContent(), $foreign->getContent());
        $this->assertNothingWritten();
    }

    public function test_foreign_slot_with_invalid_body_is_the_missing_slot_404(): void
    {
        $missing = $this->markAttendance($this->instructor, self::MISSING_ID, ['attendance' => 'zle']);
        $foreign = $this->markAttendance($this->instructor, $this->foreignSlot->id, ['attendance' => 'zle']);

        $this->assertSame(404, $foreign->status());
        $this->assertSame($missing->status(), $foreign->status());
        $this->assertSame($missing->getContent(), $foreign->getContent());
        $this->assertNothingWritten();
    }

    public function test_foreign_slot_with_valid_body_is_the_same_404_as_any_refused_body(): void
    {
        $valid = ['attendance' => [(string) $this->otherMember->id => 'present']];
        $foreign = $this->markAttendance($this->instructor, $this->foreignSlot->id, $valid);

        // Odpowiedź nie zależy od ciała: ta sama co dla nieistniejącego terminu z pustym ciałem.
        $missingEmpty = $this->markAttendance($this->instructor, self::MISSING_ID, []);

        $this->assertSame(404, $foreign->status());
        $this->assertSame($missingEmpty->status(), $foreign->status());
        $this->assertSame($missingEmpty->getContent(), $foreign->getContent());
        $this->assertNothingWritten();
    }

    public function test_other_instructor_cannot_learn_anything_about_a_colleagues_slot(): void
    {
        $responses = [];
        foreach ($this->bodies() as $name => $body) {
            $responses[$name] = [
                'cudzy' => $this->markAttendance($this->instructor, $this->foreignSlot->id, $body),
                'brak' => $this->markAttendance($this->instructor, self::MISSING_ID, $body),
            ];
        }

        $reference = $responses['puste']['brak']->getContent();
        foreach ($responses as $name => $pair) {
            $this->assertSame(404, $pair['cudzy']->status(), "cudzy termin, ciało {$name}");
            $this->assertSame($reference, $pair['cudzy']->getContent(), "cudzy termin, ciało {$name}");
            $this->assertSame($reference, $pair['brak']->getContent(), "nieistniejący termin, ciało {$name}");
        }
        $this->assertNothingWritten();
    }

    public function test_own_slot_validates_the_body_only_after_access(): void
    {
        // Kontrola dodatnia: właściciel terminu dostaje walidację ciała (422) i zapis (200).
        $this->markAttendance($this->otherInstructor, $this->foreignSlot->id, ['attendance' => 'zle'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
        $this->markAttendance($this->otherInstructor, $this->foreignSlot->id, [])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
        $this->assertNothingWritten();

        $this->markAttendance($this->otherInstructor, $this->foreignSlot->id, ['attendance' => [(string) $this->otherMember->id => 'present']])
            ->assertOk();
        $this->assertSame('present', $this->foreignSignup->fresh()->attendance);
    }

    public function test_administration_keeps_its_response_on_this_route(): void
    {
        foreach (['project_manager', 'super_admin'] as $role) {
            $admin = User::factory()->role($role)->create();
            foreach ($this->bodies() as $name => $body) {
                $this->markAttendance($admin, $this->foreignSlot->id, $body)
                    ->assertStatus(403)
                    ->assertJsonPath('error.code', 'forbidden');
                $this->markAttendance($admin, self::MISSING_ID, $body)
                    ->assertStatus(403)
                    ->assertJsonPath('error.code', 'forbidden');
            }
        }
        $this->assertNothingWritten();
    }
}
