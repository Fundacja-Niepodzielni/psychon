<?php

namespace Tests\Feature\Chat;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Wątek grupowy zakłada wyłącznie prowadzący. Skład grupy przypisuje i
 * kończy wyłącznie administracja — adres składu wątku sprawdza
 * `GroupMembershipIsAssignedByAdministrationTest`. Każde kryterium ma nogę
 * pozytywną i przynajmniej jedną negatywną.
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
}
