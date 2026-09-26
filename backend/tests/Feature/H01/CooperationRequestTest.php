<?php

namespace Tests\Feature\H01;

use App\Models\AuditLogEntry;
use App\Models\CooperationRequest;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Zgłoszenie dalszej współpracy po zakończeniu programu: trasy osoby
 * zgłaszającej i administracji z pliku pakietu `routes/api/h01.php`.
 */
class CooperationRequestTest extends TestCase
{
    use RefreshDatabase;

    private function graduate(array $attributes = []): User
    {
        return User::factory()->create([
            'role' => 'volunteer',
            'program_completed_at' => now()->subDay(),
            ...$attributes,
        ]);
    }

    public function test_graduate_submits_request_and_creation_is_audited(): void
    {
        $graduate = $this->graduate();

        $response = $this->actingAs($graduate, 'keycloak')
            ->postJson('/api/v1/cooperation-requests', [
                'body' => 'Chcę dalej prowadzić dyżury telefoniczne.',
                'user_id' => 999,
                'status' => 'answered',
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', 'new')
            ->assertJsonPath('data.body', 'Chcę dalej prowadzić dyżury telefoniczne.')
            ->assertJsonPath('data.response', null)
            ->assertJsonPath('data.responded_at', null);
        $this->assertSame(
            ['id', 'body', 'status', 'response', 'responded_at', 'created_at', 'updated_at'],
            array_keys($response->json('data')),
        );

        $id = $response->json('data.id');
        $this->assertDatabaseHas('cooperation_requests', [
            'id' => $id,
            'user_id' => $graduate->id,
            'status' => 'new',
        ]);

        $entry = AuditLogEntry::query()->where('action', 'cooperation_request.created')->sole();
        $this->assertSame($graduate->id, (int) $entry->actor_id);
        $this->assertSame((new CooperationRequest)->getMorphClass(), $entry->subject_type);
        $this->assertSame($id, (int) $entry->subject_id);
        $this->assertSame(['request_id' => $id], $entry->details);
    }

    public function test_participant_without_completed_program_gets_403_and_nothing_is_stored(): void
    {
        $participant = User::factory()->create(['role' => 'volunteer', 'program_completed_at' => null]);

        $this->actingAs($participant, 'keycloak')
            ->postJson('/api/v1/cooperation-requests', ['body' => 'Chcę współpracować.'])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'program_not_completed');

        $this->assertDatabaseCount('cooperation_requests', 0);
        $this->assertDatabaseMissing('audit_log', ['action' => 'cooperation_request.created']);
    }

    public function test_second_open_request_returns_409_but_a_new_one_is_allowed_after_answer(): void
    {
        $graduate = $this->graduate();

        $this->actingAs($graduate, 'keycloak')
            ->postJson('/api/v1/cooperation-requests', ['body' => 'Pierwsze zgłoszenie.'])
            ->assertCreated();

        $this->actingAs($graduate, 'keycloak')
            ->postJson('/api/v1/cooperation-requests', ['body' => 'Drugie zgłoszenie.'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'cooperation_request_open');
        $this->assertDatabaseCount('cooperation_requests', 1);

        CooperationRequest::query()->update(['status' => 'answered']);

        $this->actingAs($graduate, 'keycloak')
            ->postJson('/api/v1/cooperation-requests', ['body' => 'Kolejne zgłoszenie po odpowiedzi.'])
            ->assertCreated();
        $this->assertDatabaseCount('cooperation_requests', 2);
    }

    public function test_body_is_required_and_limited_to_2000_characters(): void
    {
        $graduate = $this->graduate();

        $this->actingAs($graduate, 'keycloak')
            ->postJson('/api/v1/cooperation-requests', ['body' => str_repeat('a', 2001)])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['body']]]);

        $this->actingAs($graduate, 'keycloak')
            ->postJson('/api/v1/cooperation-requests', [])
            ->assertStatus(422)
            ->assertJsonStructure(['error' => ['errors' => ['body']]]);

        $this->actingAs($graduate, 'keycloak')
            ->postJson('/api/v1/cooperation-requests', ['body' => str_repeat('a', 2000)])
            ->assertCreated();
    }

    public function test_non_participant_roles_cannot_use_participant_routes(): void
    {
        foreach (['instructor', 'project_manager'] as $role) {
            $user = User::factory()->create(['role' => $role, 'program_completed_at' => now()]);

            $this->actingAs($user, 'keycloak')
                ->postJson('/api/v1/cooperation-requests', ['body' => 'Treść.'])
                ->assertStatus(403)
                ->assertJsonPath('error.code', 'forbidden');

            $this->actingAs($user, 'keycloak')
                ->getJson('/api/v1/cooperation-requests/mine')
                ->assertStatus(403);
        }

        $this->assertDatabaseCount('cooperation_requests', 0);
    }

    public function test_mine_lists_only_own_requests_with_the_response(): void
    {
        $graduate = $this->graduate();
        $other = $this->graduate();
        $admin = User::factory()->create(['role' => 'project_manager']);

        CooperationRequest::create([
            'user_id' => $graduate->id,
            'body' => 'Moje zgłoszenie.',
            'status' => 'answered',
            'response' => 'Odezwiemy się w przyszłym tygodniu.',
            'responded_by' => $admin->id,
            'responded_at' => now(),
        ]);
        CooperationRequest::create([
            'user_id' => $other->id,
            'body' => 'Cudze zgłoszenie.',
            'status' => 'new',
        ]);

        $response = $this->actingAs($graduate, 'keycloak')
            ->getJson('/api/v1/cooperation-requests/mine');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.body', 'Moje zgłoszenie.')
            ->assertJsonPath('data.0.response', 'Odezwiemy się w przyszłym tygodniu.')
            ->assertJsonPath('meta.total', 1);
        $this->assertStringNotContainsString('Cudze zgłoszenie.', $response->getContent());
        $this->assertArrayNotHasKey('responded_by', $response->json('data.0'));
    }

    public function test_admin_lists_requests_filtered_by_status_with_pagination(): void
    {
        $admin = User::factory()->create(['role' => 'project_manager']);
        $first = $this->graduate(['first_name' => 'Marta', 'last_name' => 'Demo']);
        $second = $this->graduate();

        CooperationRequest::create(['user_id' => $first->id, 'body' => 'Nowe A.', 'status' => 'new']);
        CooperationRequest::create(['user_id' => $second->id, 'body' => 'Nowe B.', 'status' => 'new']);
        CooperationRequest::create(['user_id' => $second->id, 'body' => 'Zamknięte.', 'status' => 'closed']);

        $this->actingAs($admin, 'keycloak')
            ->getJson('/api/v1/admin/cooperation-requests')
            ->assertOk()
            ->assertJsonPath('meta.total', 3);

        $filtered = $this->actingAs($admin, 'keycloak')
            ->getJson('/api/v1/admin/cooperation-requests?status=new&per_page=1');

        $filtered->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.body', 'Nowe A.')
            ->assertJsonPath('data.0.status', 'new')
            ->assertJsonPath('data.0.user.first_name', 'Marta')
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('meta.last_page', 2)
            ->assertJsonPath('meta.per_page', 1);

        $this->actingAs($admin, 'keycloak')
            ->getJson('/api/v1/admin/cooperation-requests?status=pending')
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_admin_answer_sets_status_who_and_when_notifies_and_audits(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin']);
        $graduate = $this->graduate();
        $cooperation = CooperationRequest::create([
            'user_id' => $graduate->id,
            'body' => 'Chcę dalej pomagać.',
            'status' => 'new',
        ]);

        $response = $this->actingAs($admin, 'keycloak')
            ->patchJson("/api/v1/admin/cooperation-requests/{$cooperation->id}", [
                'response' => 'Zapraszamy na rozmowę.',
                'status' => 'answered',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.status', 'answered')
            ->assertJsonPath('data.response', 'Zapraszamy na rozmowę.')
            ->assertJsonPath('data.responded_by', $admin->id);
        $this->assertNotNull($response->json('data.responded_at'));

        $fresh = $cooperation->fresh();
        $this->assertSame('answered', $fresh->status);
        $this->assertSame($admin->id, $fresh->responded_by);
        $this->assertNotNull($fresh->responded_at);

        $notification = Notification::query()->where('user_id', $graduate->id)->sole();
        $this->assertSame('cooperation_request.answered', $notification->type);
        $this->assertSame('/panel/po-programie', $notification->link);

        $entry = AuditLogEntry::query()->where('action', 'cooperation_request.answered')->sole();
        $this->assertSame($admin->id, (int) $entry->actor_id);
        $this->assertSame($cooperation->id, (int) $entry->subject_id);
        $this->assertSame(['request_id' => $cooperation->id, 'status' => 'answered'], $entry->details);

        $this->actingAs($graduate, 'keycloak')
            ->getJson('/api/v1/cooperation-requests/mine')
            ->assertJsonPath('data.0.response', 'Zapraszamy na rozmowę.')
            ->assertJsonPath('data.0.status', 'answered');
    }

    public function test_admin_answer_validation_unknown_id_and_closed_request(): void
    {
        $admin = User::factory()->create(['role' => 'project_manager']);
        $graduate = $this->graduate();
        $closed = CooperationRequest::create([
            'user_id' => $graduate->id,
            'body' => 'Zamknięte zgłoszenie.',
            'status' => 'closed',
        ]);

        $this->actingAs($admin, 'keycloak')
            ->patchJson("/api/v1/admin/cooperation-requests/{$closed->id}", ['status' => 'new'])
            ->assertStatus(422)
            ->assertJsonStructure(['error' => ['errors' => ['response', 'status']]]);

        $this->actingAs($admin, 'keycloak')
            ->patchJson('/api/v1/admin/cooperation-requests/999999', [
                'response' => 'Odpowiedź.',
                'status' => 'answered',
            ])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->actingAs($admin, 'keycloak')
            ->patchJson("/api/v1/admin/cooperation-requests/{$closed->id}", [
                'response' => 'Odpowiedź.',
                'status' => 'answered',
            ])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'cooperation_request_closed');

        $this->assertSame('closed', $closed->fresh()->status);
        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_participant_cannot_use_admin_routes(): void
    {
        $graduate = $this->graduate();
        $cooperation = CooperationRequest::create([
            'user_id' => $graduate->id,
            'body' => 'Zgłoszenie.',
            'status' => 'new',
        ]);

        $this->actingAs($graduate, 'keycloak')
            ->getJson('/api/v1/admin/cooperation-requests')
            ->assertStatus(403);

        $this->actingAs($graduate, 'keycloak')
            ->patchJson("/api/v1/admin/cooperation-requests/{$cooperation->id}", [
                'response' => 'Sam sobie odpowiadam.',
                'status' => 'answered',
            ])
            ->assertStatus(403);

        $this->assertSame('new', $cooperation->fresh()->status);
    }

    public function test_guest_gets_401(): void
    {
        $this->postJson('/api/v1/cooperation-requests', ['body' => 'Treść.'])->assertStatus(401);
        $this->getJson('/api/v1/cooperation-requests/mine')->assertStatus(401);
        $this->getJson('/api/v1/admin/cooperation-requests')->assertStatus(401);
    }
}
