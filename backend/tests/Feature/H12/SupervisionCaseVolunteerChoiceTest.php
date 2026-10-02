<?php

namespace Tests\Feature\H12;

use App\Models\SupervisionCase;
use App\Models\SupervisorAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Zgłoszenie sprawy przez prowadzącego może wskazać wyłącznie osobę z jego
 * grupy. Osoba spoza grupy i identyfikator, którego nie ma, dostają tę samą
 * odpowiedź — nic nie mówi, czy konto istnieje.
 */
class SupervisionCaseVolunteerChoiceTest extends TestCase
{
    use RefreshDatabase;

    private function report(User $instructor, mixed $volunteerId): string
    {
        $response = $this->actingAs($instructor, 'keycloak')->postJson('/api/v1/instructor/cases', [
            'volunteer_id' => $volunteerId,
            'subject' => 'Temat zgłoszenia',
            'body' => 'Opis sprawy bez danych osób.',
        ]);

        return $response->getStatusCode().' '.$response->getContent();
    }

    public function test_a_person_outside_the_group_and_a_missing_id_get_the_same_answer(): void
    {
        $instructor = User::factory()->role('instructor')->create();
        $other = User::factory()->role('instructor')->create();
        $foreign = User::factory()->role('volunteer')->create();
        SupervisorAssignment::query()->create([
            'volunteer_id' => $foreign->id, 'supervisor_id' => $other->id, 'assigned_at' => now(),
        ]);
        $unassigned = User::factory()->role('volunteer')->create();
        $missing = (int) User::query()->max('id') + 1000;

        $answer = $this->report($instructor, $missing);

        $this->assertStringStartsWith('422 ', $answer);
        $this->assertSame(
            ['volunteer_id' => ['Możesz wskazać wyłącznie osobę ze swojej grupy.']],
            json_decode(substr($answer, 4), true)['error']['errors'],
        );
        $this->assertSame($answer, $this->report($instructor, $foreign->id));
        $this->assertSame($answer, $this->report($instructor, $unassigned->id));
        $this->assertSame(0, SupervisionCase::query()->count());
    }

    public function test_a_person_from_the_own_group_is_accepted(): void
    {
        $instructor = User::factory()->role('instructor')->create();
        $member = User::factory()->role('volunteer')->create();
        SupervisorAssignment::query()->create([
            'volunteer_id' => $member->id, 'supervisor_id' => $instructor->id, 'assigned_at' => now(),
        ]);

        $this->assertStringStartsWith('201 ', $this->report($instructor, $member->id));
        $this->assertStringStartsWith('201 ', $this->report($instructor, null));
        $this->assertStringStartsWith('422 ', $this->report($instructor, 'nie-liczba'));
        $this->assertSame(2, SupervisionCase::query()->count());
    }
}
