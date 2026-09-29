<?php

namespace Tests\Feature\Chat;

use App\Models\Message;
use App\Models\MessageThread;
use App\Models\SupervisorAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Żaden test zaplecza nie wołał dotąd `GET /threads/{id}` ani
 * `POST /threads/{id}/messages` jako osoba spoza wątku. Kod już odmawia
 * z projektu (`ChatThreadQuery::visibleTo` w WHERE, `MessageController` →
 * 404) — ten plik jest próbą tego zachowania, nie nową regułą.
 *
 * Reguła kontraktu §1.1: cudzy i nieistniejący wątek wyglądają identycznie
 * z zewnątrz — 404 `not_found`, nigdy 403, dla pojedynczego zasobu
 * wskazanego identyfikatorem.
 */
class ThreadAccessTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET_BODY = 'TAJNA-TRESC-WATKU-NIE-MOJEGO';

    public function test_member_of_individual_thread_reads_it(): void
    {
        $volunteer = User::factory()->role('volunteer')->create();
        $supervisor = User::factory()->role('instructor')->create();

        $thread = MessageThread::query()->create([
            'type' => 'individual',
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $supervisor->id,
        ]);

        Message::query()->create([
            'thread_id' => $thread->id,
            'sender_id' => $supervisor->id,
            'body' => self::SECRET_BODY,
        ]);

        $this->actingAs($volunteer, 'keycloak')
            ->getJson("/api/v1/threads/{$thread->id}")
            ->assertOk()
            ->assertJsonFragment(['body' => self::SECRET_BODY]);
    }

    public function test_volunteer_with_different_supervisor_cannot_read_foreign_individual_thread(): void
    {
        $owner = User::factory()->role('volunteer')->create();
        $ownerSupervisor = User::factory()->role('instructor')->create();

        $thread = MessageThread::query()->create([
            'type' => 'individual',
            'volunteer_id' => $owner->id,
            'supervisor_id' => $ownerSupervisor->id,
        ]);

        Message::query()->create([
            'thread_id' => $thread->id,
            'sender_id' => $ownerSupervisor->id,
            'body' => self::SECRET_BODY,
        ]);

        $stranger = User::factory()->role('volunteer')->create();
        $strangerSupervisor = User::factory()->role('instructor')->create();
        SupervisorAssignment::query()->create([
            'volunteer_id' => $stranger->id,
            'supervisor_id' => $strangerSupervisor->id,
            'assigned_at' => now(),
        ]);

        $response = $this->actingAs($stranger, 'keycloak')
            ->getJson("/api/v1/threads/{$thread->id}");

        $response->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->assertStringNotContainsString(self::SECRET_BODY, $response->getContent());
    }

    public function test_nonexistent_thread_returns_identical_message_as_foreign_thread(): void
    {
        $owner = User::factory()->role('volunteer')->create();
        $ownerSupervisor = User::factory()->role('instructor')->create();

        $thread = MessageThread::query()->create([
            'type' => 'individual',
            'volunteer_id' => $owner->id,
            'supervisor_id' => $ownerSupervisor->id,
        ]);

        $stranger = User::factory()->role('volunteer')->create();
        $strangerSupervisor = User::factory()->role('instructor')->create();
        SupervisorAssignment::query()->create([
            'volunteer_id' => $stranger->id,
            'supervisor_id' => $strangerSupervisor->id,
            'assigned_at' => now(),
        ]);

        $foreignResponse = $this->actingAs($stranger, 'keycloak')
            ->getJson("/api/v1/threads/{$thread->id}");

        $nonexistentId = MessageThread::query()->max('id') + 1000;

        $nonexistentResponse = $this->actingAs($stranger, 'keycloak')
            ->getJson("/api/v1/threads/{$nonexistentId}");

        $foreignResponse->assertStatus(404)->assertJsonPath('error.code', 'not_found');
        $nonexistentResponse->assertStatus(404)->assertJsonPath('error.code', 'not_found');

        $this->assertSame($foreignResponse->status(), $nonexistentResponse->status());
        $this->assertSame($foreignResponse->json(), $nonexistentResponse->json());
    }

    public function test_non_member_cannot_post_message_and_no_row_is_written(): void
    {
        $owner = User::factory()->role('volunteer')->create();
        $ownerSupervisor = User::factory()->role('instructor')->create();

        $thread = MessageThread::query()->create([
            'type' => 'individual',
            'volunteer_id' => $owner->id,
            'supervisor_id' => $ownerSupervisor->id,
        ]);

        $stranger = User::factory()->role('volunteer')->create();
        $strangerSupervisor = User::factory()->role('instructor')->create();
        SupervisorAssignment::query()->create([
            'volunteer_id' => $stranger->id,
            'supervisor_id' => $strangerSupervisor->id,
            'assigned_at' => now(),
        ]);

        $countBefore = Message::query()->count();

        $this->actingAs($stranger, 'keycloak')
            ->postJson("/api/v1/threads/{$thread->id}/messages", ['body' => 'proba wlamania'])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->assertSame($countBefore, Message::query()->count());
    }

    public function test_group_thread_unassigned_member_is_denied_active_member_is_allowed(): void
    {
        $instructor = User::factory()->role('instructor')->create();
        $activeVolunteer = User::factory()->role('volunteer')->create();
        $removedVolunteer = User::factory()->role('volunteer')->create();

        $thread = MessageThread::query()->create([
            'type' => 'group',
            'supervisor_id' => $instructor->id,
        ]);

        SupervisorAssignment::query()->create([
            'volunteer_id' => $activeVolunteer->id,
            'supervisor_id' => $instructor->id,
            'assigned_at' => now()->subDays(2),
        ]);

        SupervisorAssignment::query()->create([
            'volunteer_id' => $removedVolunteer->id,
            'supervisor_id' => $instructor->id,
            'assigned_at' => now()->subDays(10),
            'unassigned_at' => now()->subDay(),
        ]);

        // Osoba z zakończonym przypisaniem: odmowa na obu operacjach.
        $this->actingAs($removedVolunteer, 'keycloak')
            ->getJson("/api/v1/threads/{$thread->id}")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->actingAs($removedVolunteer, 'keycloak')
            ->postJson("/api/v1/threads/{$thread->id}/messages", ['body' => 'juz mnie tu nie ma'])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        // Osoba z aktywnym przypisaniem: dostęp na obu operacjach.
        $this->actingAs($activeVolunteer, 'keycloak')
            ->getJson("/api/v1/threads/{$thread->id}")
            ->assertOk();

        $this->actingAs($activeVolunteer, 'keycloak')
            ->postJson("/api/v1/threads/{$thread->id}/messages", ['body' => 'nadal jestem w zespole'])
            ->assertCreated();
    }

    public function test_instructor_who_is_not_supervisor_of_thread_is_denied(): void
    {
        $owner = User::factory()->role('instructor')->create();
        $otherInstructor = User::factory()->role('instructor')->create();

        $thread = MessageThread::query()->create([
            'type' => 'group',
            'supervisor_id' => $owner->id,
        ]);

        $this->actingAs($otherInstructor, 'keycloak')
            ->getJson("/api/v1/threads/{$thread->id}")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->actingAs($otherInstructor, 'keycloak')
            ->postJson("/api/v1/threads/{$thread->id}/messages", ['body' => 'nie moj zespol'])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }
}
