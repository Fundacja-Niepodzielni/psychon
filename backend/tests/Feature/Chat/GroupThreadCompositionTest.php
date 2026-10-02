<?php

namespace Tests\Feature\Chat;

use App\Models\MessageThread;
use App\Models\SupervisorAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Wątek grupowy zakłada wyłącznie prowadzący; on też może usunąć osobę ze
 * składu. Osoby do grupy przypisuje wyłącznie administracja — trasę
 * dodawania sprawdza `GroupMembershipIsAssignedByAdministrationTest`.
 * Każde kryterium ma nogę pozytywną i przynajmniej jedną negatywną.
 */
class GroupThreadCompositionTest extends TestCase
{
    use RefreshDatabase;

    public function test_instructor_creates_own_group_thread_idempotently(): void
    {
        $instructor = User::factory()->role('instructor')->create();

        $this->actingAs($instructor, 'keycloak')
            ->postJson('/api/v1/threads')
            ->assertCreated()
            ->assertJsonPath('data.type', 'group')
            ->assertJsonPath('data.supervisor.id', $instructor->id);

        $this->assertDatabaseCount('message_threads', 1);

        // Drugie wywołanie jest idempotentne: ten sam wątek, 200 zamiast 201.
        $this->actingAs($instructor, 'keycloak')
            ->postJson('/api/v1/threads')
            ->assertOk()
            ->assertJsonPath('data.supervisor.id', $instructor->id);

        $this->assertDatabaseCount('message_threads', 1);
    }

    public static function forbiddenCreatorRoles(): array
    {
        return [
            'administracja (project_manager)' => ['project_manager'],
            'administracja (super_admin)' => ['super_admin'],
            'uczestnik (volunteer)' => ['volunteer'],
        ];
    }

    #[DataProvider('forbiddenCreatorRoles')]
    public function test_only_instructor_may_create_group_thread(string $role): void
    {
        $actor = User::factory()->role($role)->create();

        $this->actingAs($actor, 'keycloak')
            ->postJson('/api/v1/threads')
            ->assertStatus(403);

        $this->assertDatabaseCount('message_threads', 0);
    }

    public function test_instructor_removes_member_of_own_thread(): void
    {
        $instructor = User::factory()->role('instructor')->create();
        $volunteer = User::factory()->role('volunteer')->create();

        $thread = MessageThread::query()->create([
            'type' => 'group',
            'supervisor_id' => $instructor->id,
        ]);
        SupervisorAssignment::query()->create([
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $instructor->id,
            'assigned_at' => now(),
        ]);

        $this->actingAs($instructor, 'keycloak')
            ->deleteJson("/api/v1/threads/{$thread->id}/members/{$volunteer->id}")
            ->assertOk()
            ->assertExactJson(['data' => null]);

        $assignment = SupervisorAssignment::query()
            ->where('volunteer_id', $volunteer->id)
            ->where('supervisor_id', $instructor->id)
            ->sole();
        $this->assertNotNull($assignment->unassigned_at);
    }

    public static function forbiddenMemberRemoverRoles(): array
    {
        return [
            'administracja (project_manager)' => ['project_manager'],
            'administracja (super_admin)' => ['super_admin'],
            'uczestnik (volunteer)' => ['volunteer'],
        ];
    }

    #[DataProvider('forbiddenMemberRemoverRoles')]
    public function test_only_instructor_may_remove_member(string $role): void
    {
        $owner = User::factory()->role('instructor')->create();
        $volunteer = User::factory()->role('volunteer')->create();

        $thread = MessageThread::query()->create([
            'type' => 'group',
            'supervisor_id' => $owner->id,
        ]);
        SupervisorAssignment::query()->create([
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $owner->id,
            'assigned_at' => now(),
        ]);

        $this->actingAs(User::factory()->role($role)->create(), 'keycloak')
            ->deleteJson("/api/v1/threads/{$thread->id}/members/{$volunteer->id}")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');

        $this->assertDatabaseHas('supervisor_assignments', [
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $owner->id,
            'unassigned_at' => null,
        ]);
    }

    public function test_another_instructors_thread_looks_like_a_missing_one_on_removal(): void
    {
        $owner = User::factory()->role('instructor')->create();
        $other = User::factory()->role('instructor')->create();
        $volunteer = User::factory()->role('volunteer')->create();

        $thread = MessageThread::query()->create([
            'type' => 'group',
            'supervisor_id' => $owner->id,
        ]);
        $ownIndividual = MessageThread::query()->create([
            'type' => 'individual',
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $other->id,
        ]);
        SupervisorAssignment::query()->create([
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $owner->id,
            'assigned_at' => now(),
        ]);
        $missingId = (int) MessageThread::query()->max('id') + 1000;

        $foreign = $this->actingAs($other, 'keycloak')
            ->deleteJson("/api/v1/threads/{$thread->id}/members/{$volunteer->id}")
            ->assertNotFound();
        $individual = $this->actingAs($other, 'keycloak')
            ->deleteJson("/api/v1/threads/{$ownIndividual->id}/members/{$volunteer->id}")
            ->assertNotFound();
        $missing = $this->actingAs($other, 'keycloak')
            ->deleteJson("/api/v1/threads/{$missingId}/members/{$volunteer->id}")
            ->assertNotFound();

        $this->assertSame($missing->getContent(), $foreign->getContent());
        $this->assertSame($missing->getContent(), $individual->getContent());
        $this->assertDatabaseHas('supervisor_assignments', [
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $owner->id,
            'unassigned_at' => null,
        ]);
    }
}
