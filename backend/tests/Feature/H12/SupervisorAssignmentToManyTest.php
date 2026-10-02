<?php

namespace Tests\Feature\H12;

use App\Models\AuditLogEntry;
use App\Models\MessageThread;
use App\Models\SupervisorAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Przypisanie jednego prowadzącego wielu osobom naraz
 * (`POST /admin/supervisor-assignments`) — ta sama usługa co pojedyncze
 * `PUT /admin/users/{id}/supervisor`, wołana osobno dla każdej osoby.
 * Każda osoba dostaje dokładnie te same skutki co przy pojedynczym
 * przypisaniu: jeden wpis w dzienniku przy zmianie, zero wpisów bez zmiany,
 * zero powiadomień i tę samą zmianę w rozmowach.
 */
class SupervisorAssignmentToManyTest extends TestCase
{
    use RefreshDatabase;

    private const string ROUTE = '/api/v1/admin/supervisor-assignments';

    public function test_assigns_every_person_with_one_audit_entry_each_and_no_notifications(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $supervisor = User::factory()->role('instructor')->create();
        $people = User::factory()->count(3)->create(['role' => 'volunteer']);
        $ids = $people->pluck('id')->all();

        $this->actingAs($admin, 'keycloak')
            ->postJson(self::ROUTE, ['supervisor_id' => $supervisor->id, 'user_ids' => $ids])
            ->assertOk()
            ->assertExactJson(['data' => [
                'supervisor_id' => $supervisor->id,
                'results' => array_map(
                    fn (int $id): array => ['user_id' => $id, 'result' => 'assigned', 'reason' => null],
                    $ids,
                ),
                'summary' => ['requested' => 3, 'assigned' => 3, 'unchanged' => 0, 'refused' => 0, 'not_found' => 0],
            ]]);

        $entries = AuditLogEntry::query()->where('action', 'supervisor.assigned')->orderBy('id')->get();
        $this->assertCount(3, $entries);

        foreach ($ids as $index => $id) {
            $this->assertSame([$supervisor->id], $this->activeSupervisorIds($people[$index]));
            $this->assertSame((int) $admin->id, (int) $entries[$index]->actor_id);
            $this->assertSame(['volunteer_id' => $id, 'supervisor_id' => $supervisor->id], $entries[$index]->details);
        }
        $this->assertSame(0, DB::table('notifications')->count());
    }

    public function test_mixed_results_keep_request_order_and_partial_success(): void
    {
        $admin = User::factory()->role('super_admin')->create();
        $supervisor = User::factory()->role('instructor')->create();
        $previous = User::factory()->role('instructor')->create();

        $fresh = User::factory()->create(['role' => 'volunteer']);
        $same = User::factory()->create(['role' => 'volunteer']);
        $moved = User::factory()->create(['role' => 'volunteer']);
        $student = User::factory()->role('student')->create();
        $instructor = User::factory()->role('instructor')->create();
        $missing = User::query()->max('id') + 1000;

        $this->assign($same, $supervisor);
        $this->assign($moved, $previous);

        $response = $this->actingAs($admin, 'keycloak')
            ->postJson(self::ROUTE, [
                'supervisor_id' => $supervisor->id,
                'user_ids' => [$student->id, $fresh->id, $missing, $same->id, $moved->id, $instructor->id],
            ])
            ->assertOk();

        $this->assertSame([
            ['user_id' => $student->id, 'result' => 'refused', 'reason' => 'role_not_assignable'],
            ['user_id' => $fresh->id, 'result' => 'assigned', 'reason' => null],
            ['user_id' => $missing, 'result' => 'not_found', 'reason' => null],
            ['user_id' => $same->id, 'result' => 'unchanged', 'reason' => null],
            ['user_id' => $moved->id, 'result' => 'assigned', 'reason' => null],
            ['user_id' => $instructor->id, 'result' => 'refused', 'reason' => 'role_not_assignable'],
        ], $response->json('data.results'));
        $response->assertJsonPath('data.summary', [
            'requested' => 6, 'assigned' => 2, 'unchanged' => 1, 'refused' => 2, 'not_found' => 1,
        ]);

        // Odmowa przy jednej osobie nie cofa przypisań pozostałych.
        foreach ([$fresh, $same, $moved] as $person) {
            $this->assertSame([$supervisor->id], $this->activeSupervisorIds($person));
        }
        $this->assertSame(0, SupervisorAssignment::query()->whereIn('volunteer_id', [$student->id, $instructor->id])->count());
        // Poprzednie przypisanie przeniesionej osoby jest zamknięte, nie usunięte.
        $this->assertSame(2, SupervisorAssignment::query()->where('volunteer_id', $moved->id)->count());
        // Dwa wpisy z przygotowania danych i dwa z tego żądania (nowa i przeniesiona osoba).
        $this->assertSame(4, AuditLogEntry::query()->where('action', 'supervisor.assigned')->count());
    }

    public function test_person_already_assigned_to_this_supervisor_gets_no_second_audit_entry(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $supervisor = User::factory()->role('instructor')->create();
        $person = User::factory()->create(['role' => 'volunteer']);

        $this->actingAs($admin, 'keycloak')
            ->putJson("/api/v1/admin/users/{$person->id}/supervisor", ['supervisor_id' => $supervisor->id])
            ->assertOk();
        $this->assertSame(1, AuditLogEntry::query()->where('action', 'supervisor.assigned')->count());

        $this->actingAs($admin, 'keycloak')
            ->postJson(self::ROUTE, ['supervisor_id' => $supervisor->id, 'user_ids' => [$person->id]])
            ->assertOk()
            ->assertJsonPath('data.results.0.result', 'unchanged')
            ->assertJsonPath('data.summary.unchanged', 1);

        $this->assertSame(1, AuditLogEntry::query()->where('action', 'supervisor.assigned')->count());
        $this->assertSame(1, SupervisorAssignment::query()->where('volunteer_id', $person->id)->count());
    }

    public function test_more_than_one_hundred_people_is_a_validation_error_and_nothing_is_written(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $supervisor = User::factory()->role('instructor')->create();
        $person = User::factory()->create(['role' => 'volunteer']);
        $ids = [$person->id, ...range(900001, 900100)];

        $this->actingAs($admin, 'keycloak')
            ->postJson(self::ROUTE, ['supervisor_id' => $supervisor->id, 'user_ids' => $ids])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.user_ids.0', 'Jednym żądaniem można przypisać najwyżej 100 osób.');

        $this->assertSame(0, SupervisorAssignment::query()->count());
        $this->assertSame(0, AuditLogEntry::query()->where('action', 'supervisor.assigned')->count());
    }

    public function test_exactly_one_hundred_people_is_accepted(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $supervisor = User::factory()->role('instructor')->create();

        $this->actingAs($admin, 'keycloak')
            ->postJson(self::ROUTE, ['supervisor_id' => $supervisor->id, 'user_ids' => range(900001, 900100)])
            ->assertOk()
            ->assertJsonPath('data.summary.requested', 100)
            ->assertJsonPath('data.summary.not_found', 100);
    }

    public function test_duplicate_people_are_a_validation_error_and_nothing_is_written(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $supervisor = User::factory()->role('instructor')->create();
        $person = User::factory()->create(['role' => 'volunteer']);
        $other = User::factory()->create(['role' => 'volunteer']);

        $this->actingAs($admin, 'keycloak')
            ->postJson(self::ROUTE, [
                'supervisor_id' => $supervisor->id,
                'user_ids' => [$person->id, $other->id, $person->id],
            ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors', [
                'user_ids.0' => ['Ta sama osoba występuje na liście więcej niż raz.'],
                'user_ids.2' => ['Ta sama osoba występuje na liście więcej niż raz.'],
            ]);

        $this->assertSame(0, SupervisorAssignment::query()->count());
    }

    public function test_empty_list_and_missing_supervisor_are_validation_errors(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $supervisor = User::factory()->role('instructor')->create();

        $this->actingAs($admin, 'keycloak')
            ->postJson(self::ROUTE, ['supervisor_id' => $supervisor->id, 'user_ids' => []])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.user_ids.0', 'Wskaż co najmniej jedną osobę.');

        $this->actingAs($admin, 'keycloak')
            ->postJson(self::ROUTE, ['user_ids' => [1]])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.supervisor_id.0', 'Wybierz superwizora.');
    }

    public function test_supervisor_without_instructor_role_refuses_the_whole_request(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $notInstructor = User::factory()->create(['role' => 'volunteer']);
        $person = User::factory()->create(['role' => 'volunteer']);

        $this->actingAs($admin, 'keycloak')
            ->postJson(self::ROUTE, ['supervisor_id' => $notInstructor->id, 'user_ids' => [$person->id]])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.supervisor_id.0', 'Wybrana osoba nie ma roli prowadzącego.');

        $this->assertSame(0, SupervisorAssignment::query()->count());
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function rolesWithoutAccess(): array
    {
        return [
            'wolontariusz' => ['volunteer'],
            'student' => ['student'],
            'prowadzący' => ['instructor'],
        ];
    }

    #[DataProvider('rolesWithoutAccess')]
    public function test_caller_without_permission_gets_the_same_refusal_as_on_the_single_route(string $role): void
    {
        $caller = User::factory()->role($role)->create();
        $supervisor = User::factory()->role('instructor')->create();
        $person = User::factory()->create(['role' => 'volunteer']);

        $single = $this->actingAs($caller, 'keycloak')
            ->putJson("/api/v1/admin/users/{$person->id}/supervisor", ['supervisor_id' => $supervisor->id]);
        $many = $this->actingAs($caller, 'keycloak')
            ->postJson(self::ROUTE, ['supervisor_id' => $supervisor->id, 'user_ids' => [$person->id]]);

        $single->assertStatus(403)->assertJsonPath('error.code', 'forbidden');
        $many->assertStatus(403);
        $this->assertSame($single->json('error'), $many->json('error'));
        $this->assertSame(0, SupervisorAssignment::query()->count());
    }

    public function test_guest_gets_the_same_refusal_as_on_the_single_route(): void
    {
        $single = $this->putJson('/api/v1/admin/users/1/supervisor', ['supervisor_id' => 2]);
        $many = $this->postJson(self::ROUTE, ['supervisor_id' => 2, 'user_ids' => [1]]);

        $single->assertStatus(401)->assertJsonPath('error.code', 'unauthenticated');
        $many->assertStatus(401);
        $this->assertSame($single->json('error'), $many->json('error'));
    }

    public function test_previous_supervisor_loses_the_conversation_for_every_changed_person(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $previous = User::factory()->role('instructor')->create();
        $next = User::factory()->role('instructor')->create();
        $people = User::factory()->count(2)->create(['role' => 'volunteer']);

        foreach ($people as $person) {
            $this->assign($person, $previous);
        }
        $before = $this->conversationsBefore($previous, $people->all());

        $this->actingAs($admin, 'keycloak')
            ->postJson(self::ROUTE, ['supervisor_id' => $next->id, 'user_ids' => $people->pluck('id')->all()])
            ->assertOk()
            ->assertJsonPath('data.summary.assigned', 2);

        foreach ($people as $person) {
            $this->assertConversationMovedTo($person, $previous, $next, $before);
        }
    }

    public function test_single_route_changes_the_conversation_in_the_same_way(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $previous = User::factory()->role('instructor')->create();
        $next = User::factory()->role('instructor')->create();
        $person = User::factory()->create(['role' => 'volunteer']);

        $this->assign($person, $previous);
        $before = $this->conversationsBefore($previous, [$person]);

        $this->actingAs($admin, 'keycloak')
            ->putJson("/api/v1/admin/users/{$person->id}/supervisor", ['supervisor_id' => $next->id])
            ->assertOk();

        $this->assertConversationMovedTo($person, $previous, $next, $before);
    }

    private function assign(User $person, User $supervisor): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $this->actingAs($admin, 'keycloak')
            ->putJson("/api/v1/admin/users/{$person->id}/supervisor", ['supervisor_id' => $supervisor->id])
            ->assertOk();
    }

    /**
     * @return list<int>
     */
    private function activeSupervisorIds(User $person): array
    {
        return SupervisorAssignment::query()
            ->where('volunteer_id', $person->id)
            ->whereNull('unassigned_at')
            ->pluck('supervisor_id')
            ->map(fn ($id): int => (int) $id)
            ->all();
    }

    /**
     * Stan rozmów przed zmianą: poprzedni prowadzący ma na liście rozmowę
     * indywidualną z każdą osobą, a każda osoba widzi jego wątek grupowy.
     *
     * @param  list<User>  $people
     * @return array{group: int, individual: array<int, int>}
     */
    private function conversationsBefore(User $previous, array $people): array
    {
        $listed = $this->threadsOf($previous);
        $group = MessageThread::query()->where('type', 'group')->where('supervisor_id', $previous->id)->sole();
        $individual = [];

        foreach ($people as $person) {
            $thread = MessageThread::query()
                ->where('type', 'individual')
                ->where('volunteer_id', $person->id)
                ->where('supervisor_id', $previous->id)
                ->sole();
            $this->assertContains($thread->id, $listed);
            $this->actingAs($person, 'keycloak')->getJson("/api/v1/threads/{$group->id}")->assertOk();
            $individual[$person->id] = $thread->id;
        }

        return ['group' => $group->id, 'individual' => $individual];
    }

    /**
     * Te same asercje dla trasy pojedynczej i dla przypisania wielu osób.
     *
     * @param  array{group: int, individual: array<int, int>}  $before
     */
    private function assertConversationMovedTo(User $person, User $previous, User $next, array $before): void
    {
        // Poprzedni prowadzący nie ma już rozmowy z tą osobą na swojej liście.
        $this->assertNotContains($before['individual'][$person->id], $this->threadsOf($previous));

        // Osoba wypada z wątku grupowego poprzedniego prowadzącego.
        $this->actingAs($person, 'keycloak')
            ->getJson("/api/v1/threads/{$before['group']}")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        // Osoba ma na liście nową rozmowę indywidualną z nowym prowadzącym i jego wątek grupowy.
        $mine = $this->threadsResponse($person)->json('data');
        $withNext = collect($mine)->firstWhere(fn (array $thread): bool => $thread['type'] === 'individual'
            && $thread['supervisor']['id'] === $next->id);
        $this->assertNotNull($withNext);
        $this->assertNotSame($before['individual'][$person->id], $withNext['id']);
        $this->assertTrue(collect($mine)->contains(fn (array $thread): bool => $thread['type'] === 'group'
            && $thread['supervisor']['id'] === $next->id));

        // Nowy prowadzący ma na liście rozmowę z tą osobą.
        $this->assertContains($withNext['id'], $this->threadsOf($next));
    }

    /**
     * @return list<int>
     */
    private function threadsOf(User $user): array
    {
        return array_map(
            fn (array $thread): int => (int) $thread['id'],
            $this->threadsResponse($user)->json('data'),
        );
    }

    private function threadsResponse(User $user): TestResponse
    {
        return $this->actingAs($user, 'keycloak')->getJson('/api/v1/threads')->assertOk();
    }
}
