<?php

namespace Tests\Feature\Chat;

use App\Models\MessageThread;
use App\Models\Notification;
use App\Models\SupervisorAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Wątek grupowy zakłada wyłącznie prowadzący, on też zarządza składem
 * (dodaje/usuwa osoby). Każde
 * kryterium ma nogę pozytywną (prowadzący, 200/201) i przynajmniej jedną
 * negatywną (403) — administracja, uczestnik, osoba spoza grupy (inny
 * prowadzący, nie właściciel tego wątku).
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

    public function test_instructor_adds_and_removes_member_of_own_thread_and_notifies_on_add(): void
    {
        $instructor = User::factory()->role('instructor')->create();
        $volunteer = User::factory()->role('volunteer')->create();

        $thread = MessageThread::query()->create([
            'type' => 'group',
            'supervisor_id' => $instructor->id,
        ]);

        $this->actingAs($instructor, 'keycloak')
            ->postJson("/api/v1/threads/{$thread->id}/members/{$volunteer->id}")
            ->assertCreated()
            ->assertJsonPath('data.volunteer_id', $volunteer->id)
            ->assertJsonPath('data.supervisor_id', $instructor->id);

        $this->assertDatabaseHas('supervisor_assignments', [
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $instructor->id,
            'unassigned_at' => null,
        ]);

        $notification = Notification::query()
            ->where('user_id', $volunteer->id)
            ->where('type', 'thread.member_added')
            ->first();

        $this->assertNotNull($notification, 'Powiadomienie o dodaniu do wątku nie powstało.');
        // Odnośnik wskazuje trasę, która istnieje w drzewie frontu
        // (frontend/app/(uczestnik)/panel/superwizja/page.tsx) — nigdy
        // adres, którego tam nie ma.
        $this->assertSame('/panel/superwizja', $notification->link);

        $this->actingAs($instructor, 'keycloak')
            ->deleteJson("/api/v1/threads/{$thread->id}/members/{$volunteer->id}")
            ->assertOk();

        $this->assertDatabaseHas('supervisor_assignments', [
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $instructor->id,
        ]);
        $assignment = SupervisorAssignment::query()
            ->where('volunteer_id', $volunteer->id)
            ->where('supervisor_id', $instructor->id)
            ->first();
        $this->assertNotNull($assignment->unassigned_at);
    }

    public function test_adding_member_already_supervised_by_me_is_idempotent(): void
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
            ->postJson("/api/v1/threads/{$thread->id}/members/{$volunteer->id}")
            ->assertCreated()
            ->assertJsonPath('data.supervisor_id', $instructor->id);

        $this->assertDatabaseCount('supervisor_assignments', 1);
    }

    /**
     * Powod zwrotu PR #35: prowadzacy A wolajac POST na WLASNY watek z ID
     * wolontariusza B, ktory ma juz aktywne przypisanie do prowadzacego C,
     * wyjmowal osobe ze skladu C bez jego wiedzy i zgody. Nowy straznik w
     * `SupervisorAssignmentService::assign($requireNoConflict: true)` ma to
     * blokowac odmowa 409 zamiast cichego przejecia — sklad C ma miec po
     * probie dokladnie tyle samo osob co przed.
     */
    public function test_adding_member_with_active_assignment_to_another_instructor_is_refused(): void
    {
        $attacker = User::factory()->role('instructor')->create();
        $rightfulOwner = User::factory()->role('instructor')->create();
        $volunteer = User::factory()->role('volunteer')->create();

        $attackerThread = MessageThread::query()->create([
            'type' => 'group',
            'supervisor_id' => $attacker->id,
        ]);

        SupervisorAssignment::query()->create([
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $rightfulOwner->id,
            'assigned_at' => now(),
        ]);

        $rightfulOwnerCompositionBefore = SupervisorAssignment::query()
            ->where('supervisor_id', $rightfulOwner->id)
            ->whereNull('unassigned_at')
            ->count();

        $this->actingAs($attacker, 'keycloak')
            ->postJson("/api/v1/threads/{$attackerThread->id}/members/{$volunteer->id}")
            ->assertStatus(409);

        $rightfulOwnerCompositionAfter = SupervisorAssignment::query()
            ->where('supervisor_id', $rightfulOwner->id)
            ->whereNull('unassigned_at')
            ->count();

        $this->assertSame($rightfulOwnerCompositionBefore, $rightfulOwnerCompositionAfter);
        $this->assertDatabaseHas('supervisor_assignments', [
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $rightfulOwner->id,
            'unassigned_at' => null,
        ]);
        $this->assertDatabaseMissing('supervisor_assignments', [
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $attacker->id,
        ]);
    }

    public static function forbiddenMemberManagers(): array
    {
        return [
            'administracja (project_manager)' => ['role', 'project_manager'],
            'administracja (super_admin)' => ['role', 'super_admin'],
            'uczestnik (volunteer)' => ['role', 'volunteer'],
            'osoba spoza grupy (inny prowadzący)' => ['other_instructor', null],
        ];
    }

    #[DataProvider('forbiddenMemberManagers')]
    public function test_only_owning_instructor_may_add_member(string $kind, ?string $role): void
    {
        $owner = User::factory()->role('instructor')->create();
        $volunteer = User::factory()->role('volunteer')->create();

        $thread = MessageThread::query()->create([
            'type' => 'group',
            'supervisor_id' => $owner->id,
        ]);

        $actor = $kind === 'other_instructor'
            ? User::factory()->role('instructor')->create()
            : User::factory()->role($role)->create();

        $this->actingAs($actor, 'keycloak')
            ->postJson("/api/v1/threads/{$thread->id}/members/{$volunteer->id}")
            ->assertStatus(403);

        $this->assertDatabaseMissing('supervisor_assignments', [
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $owner->id,
        ]);

        $this->assertDatabaseMissing('notifications', [
            'user_id' => $volunteer->id,
            'type' => 'thread.member_added',
        ]);
    }

    #[DataProvider('forbiddenMemberManagers')]
    public function test_only_owning_instructor_may_remove_member(string $kind, ?string $role): void
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

        $actor = $kind === 'other_instructor'
            ? User::factory()->role('instructor')->create()
            : User::factory()->role($role)->create();

        $this->actingAs($actor, 'keycloak')
            ->deleteJson("/api/v1/threads/{$thread->id}/members/{$volunteer->id}")
            ->assertStatus(403);

        $this->assertDatabaseHas('supervisor_assignments', [
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $owner->id,
            'unassigned_at' => null,
        ]);
    }
}
