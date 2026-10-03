<?php

namespace Tests\Feature\H12;

use App\Http\Controllers\Api\V1\H12\AdminSupervisionController;
use App\Models\AuditLogEntry;
use App\Models\Edition;
use App\Models\MessageThread;
use App\Models\SupervisorAssignment;
use App\Models\User;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\ActsWithRealmToken;
use Tests\TestCase;

/**
 * Przypisanie jednego prowadzącego wielu osobom naraz
 * (`POST /admin/supervisor-assignments`). Dla każdej osoby woła tę samą
 * usługę co pojedyncze `PUT /admin/users/{id}/supervisor`, więc uprawnienie,
 * wpisy w dzienniku zdarzeń, reguła „tylko wolontariusz” i zmiana rozmów są
 * takie same. Wynik wraca dla każdej osoby, w kolejności żądania.
 */
class SupervisorAssignmentToManyTest extends TestCase
{
    use ActsWithRealmToken;
    use RefreshDatabase;

    private const string ROUTE = '/api/v1/admin/supervisor-assignments';

    private function single(User $person): string
    {
        return "/api/v1/admin/users/{$person->id}/supervisor";
    }

    // ── Uprawnienie: to samo co na trasie pojedynczej ──────────────────────

    public function test_route_has_the_same_middleware_as_the_single_assignment_route(): void
    {
        $single = $this->routeFor('assignSupervisor');
        $many = $this->routeFor('assignSupervisorToMany');

        $this->assertSame(['PUT'], $single->methods());
        $this->assertSame(['POST'], $many->methods());
        $this->assertSame('api/v1/admin/supervisor-assignments', $many->uri());
        $this->assertSame($single->gatherMiddleware(), $many->gatherMiddleware());
        $this->assertContains('auth:keycloak', $many->gatherMiddleware());
        $this->assertContains('role:project_manager,super_admin', $many->gatherMiddleware());
    }

    /**
     * @return array<string, array{0: string, 1: string|null}>
     */
    public static function callersWithoutAccess(): array
    {
        return [
            'prowadzący' => ['instructor', null],
            'wolontariusz' => ['volunteer', null],
            'student' => ['student', null],
            'konto koordynatora z tokenem wolontariusza' => ['project_manager', 'volunteer'],
        ];
    }

    #[DataProvider('callersWithoutAccess')]
    public function test_caller_without_access_gets_the_same_refusal_as_on_the_single_route(string $role, ?string $tokenRole): void
    {
        $caller = $this->boundAccount($role);
        $supervisor = User::factory()->role('instructor')->create();
        $person = User::factory()->role('volunteer')->create();

        $single = $this->withTokenOf($caller, $tokenRole)
            ->putJson($this->single($person), ['supervisor_id' => $supervisor->id]);
        $many = $this->withTokenOf($caller, $tokenRole)
            ->postJson(self::ROUTE, ['supervisor_id' => $supervisor->id, 'user_ids' => [$person->id]]);

        $single->assertForbidden()->assertJsonPath('error.code', 'forbidden');
        $many->assertForbidden();
        $this->assertSame($single->json(), $many->json());
        $this->assertNothingWritten();
    }

    public function test_guest_gets_the_same_refusal_as_on_the_single_route(): void
    {
        $supervisor = User::factory()->role('instructor')->create();
        $person = User::factory()->role('volunteer')->create();

        $single = $this->putJson($this->single($person), ['supervisor_id' => $supervisor->id]);
        $many = $this->postJson(self::ROUTE, ['supervisor_id' => $supervisor->id, 'user_ids' => [$person->id]]);

        $single->assertUnauthorized()->assertJsonPath('error.code', 'unauthenticated');
        $many->assertUnauthorized();
        $this->assertSame($single->json(), $many->json());
        $this->assertNothingWritten();
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function administrationRoles(): array
    {
        return [
            'koordynator' => ['project_manager'],
            'administrator fundacji' => ['super_admin'],
        ];
    }

    #[DataProvider('administrationRoles')]
    public function test_administration_assigns_the_supervisor(string $role): void
    {
        $admin = $this->boundAccount($role);
        $supervisor = User::factory()->role('instructor')->create();
        $person = User::factory()->role('volunteer')->create();

        $this->withTokenOf($admin)
            ->postJson(self::ROUTE, ['supervisor_id' => $supervisor->id, 'user_ids' => [$person->id]])
            ->assertOk()
            ->assertJsonPath('data.results.0', ['user_id' => $person->id, 'result' => 'assigned', 'reason' => null]);

        $this->assertSame([$supervisor->id], $this->activeSupervisorIds($person));
    }

    // ── Walidacja listy osób ────────────────────────────────────────────────

    /**
     * Każda pozycja to treść `user_ids` zbudowana z identyfikatora istniejącej
     * wolontariuszki (`$real`), żeby było widać, że nic nie zostaje zapisane.
     *
     * @return array<string, array{0: Closure(int): mixed, 1: string}>
     */
    public static function invalidPeopleLists(): array
    {
        return [
            'zero osób' => [fn (int $real): array => [], 'user_ids'],
            'brak listy' => [fn (int $real): null => null, 'user_ids'],
            '101 osób' => [fn (int $real): array => [$real, ...range(900001, 900100)], 'user_ids'],
            'ta sama osoba dwa razy' => [fn (int $real): array => [$real, 900001, $real], 'user_ids.0'],
            'identyfikator jako napis' => [fn (int $real): array => [(string) $real], 'user_ids.0'],
            'identyfikator ułamkowy' => [fn (int $real): array => [$real, 1.5], 'user_ids.1'],
            'identyfikator zero' => [fn (int $real): array => [$real, 0], 'user_ids.1'],
            'identyfikator ujemny' => [fn (int $real): array => [$real, -3], 'user_ids.1'],
            'pusta pozycja' => [fn (int $real): array => [$real, null], 'user_ids.1'],
            'wartość logiczna' => [fn (int $real): array => [$real, true], 'user_ids.1'],
            'słownik zamiast listy' => [fn (int $real): array => ['osoba' => $real], 'user_ids'],
            'pojedyncza liczba zamiast listy' => [fn (int $real): int => $real, 'user_ids'],
        ];
    }

    /**
     * @param  Closure(int): mixed  $build
     */
    #[DataProvider('invalidPeopleLists')]
    public function test_invalid_people_list_is_rejected_and_nothing_is_written(Closure $build, string $field): void
    {
        $admin = $this->boundAccount('project_manager');
        $supervisor = User::factory()->role('instructor')->create();
        $person = User::factory()->role('volunteer')->create();

        $payload = ['supervisor_id' => $supervisor->id];
        $userIds = $build((int) $person->id);
        if ($userIds !== null) {
            $payload['user_ids'] = $userIds;
        }

        $this->withTokenOf($admin)
            ->postJson(self::ROUTE, $payload)
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => [$field]]]);

        $this->assertNothingWritten();
    }

    public function test_messages_for_the_people_list_are_in_polish(): void
    {
        $admin = $this->boundAccount('project_manager');
        $supervisor = User::factory()->role('instructor')->create();

        $this->withTokenOf($admin)
            ->postJson(self::ROUTE, ['supervisor_id' => $supervisor->id, 'user_ids' => []])
            ->assertJsonPath('error.errors.user_ids.0', 'Wskaż co najmniej jedną osobę.');
        $this->withTokenOf($admin)
            ->postJson(self::ROUTE, ['supervisor_id' => $supervisor->id, 'user_ids' => range(900001, 900101)])
            ->assertJsonPath('error.errors.user_ids.0', 'Jednym żądaniem można przypisać najwyżej 100 osób.');
        $this->withTokenOf($admin)
            ->postJson(self::ROUTE, ['supervisor_id' => $supervisor->id, 'user_ids' => [900001, 900002, 900001]])
            ->assertJsonPath('error.errors', [
                'user_ids.0' => ['Ta sama osoba występuje na liście więcej niż raz.'],
                'user_ids.2' => ['Ta sama osoba występuje na liście więcej niż raz.'],
            ]);
        $this->withTokenOf($admin)
            ->postJson(self::ROUTE, ['supervisor_id' => $supervisor->id, 'user_ids' => ['900001']])
            ->assertJsonPath('error.errors', ['user_ids.0' => ['Identyfikator osoby musi być liczbą całkowitą.']]);
    }

    public function test_one_and_exactly_one_hundred_people_are_accepted(): void
    {
        $admin = $this->boundAccount('project_manager');
        $supervisor = User::factory()->role('instructor')->create();
        $person = User::factory()->role('volunteer')->create();

        $this->withTokenOf($admin)
            ->postJson(self::ROUTE, ['supervisor_id' => $supervisor->id, 'user_ids' => [$person->id]])
            ->assertOk()
            ->assertJsonPath('data.summary.requested', 1);

        $this->withTokenOf($admin)
            ->postJson(self::ROUTE, ['supervisor_id' => $supervisor->id, 'user_ids' => range(900001, 900100)])
            ->assertOk()
            ->assertJsonPath('data.summary.requested', 100)
            ->assertJsonPath('data.summary.not_found', 100);
    }

    // ── Walidacja prowadzącego: tylko aktywne konto prowadzącego ───────────

    /**
     * @return array<string, array{0: Closure(): int, 1: string}>
     */
    public static function supervisorsNotAllowed(): array
    {
        $notAllowed = 'Prowadzącym może być tylko aktywne konto z rolą prowadzącego.';

        return [
            'konto wolontariusza' => [fn (): int => User::factory()->role('volunteer')->create()->id, $notAllowed],
            'konto koordynatora' => [fn (): int => User::factory()->role('project_manager')->create()->id, $notAllowed],
            'konto studenta' => [fn (): int => User::factory()->role('student')->create()->id, $notAllowed],
            'zablokowany prowadzący' => [
                fn (): int => User::factory()->role('instructor')->create(['status' => 'blocked'])->id,
                $notAllowed,
            ],
            'zanonimizowany prowadzący' => [
                fn (): int => User::factory()->role('instructor')->create(['status' => 'deleted', 'anonymized_at' => now()])->id,
                $notAllowed,
            ],
            'prowadzący z niewykorzystanym zaproszeniem' => [
                fn (): int => User::factory()->role('instructor')->create(['status' => 'invited'])->id,
                $notAllowed,
            ],
            'konto nie istnieje' => [fn (): int => (int) User::query()->max('id') + 1000, 'Wybrany superwizor nie istnieje.'],
        ];
    }

    /**
     * @param  Closure(): int  $supervisorId
     */
    #[DataProvider('supervisorsNotAllowed')]
    public function test_supervisor_must_be_an_active_instructor(Closure $supervisorId, string $message): void
    {
        $admin = $this->boundAccount('project_manager');
        $person = User::factory()->role('volunteer')->create();

        $this->withTokenOf($admin)
            ->postJson(self::ROUTE, ['supervisor_id' => $supervisorId(), 'user_ids' => [$person->id]])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors', ['supervisor_id' => [$message]]);

        $this->assertNothingWritten();
    }

    public function test_missing_supervisor_is_rejected_with_the_single_route_message(): void
    {
        $admin = $this->boundAccount('project_manager');
        $person = User::factory()->role('volunteer')->create();

        $this->withTokenOf($admin)
            ->postJson(self::ROUTE, ['user_ids' => [$person->id]])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.supervisor_id.0', 'Wybierz superwizora.');

        $this->assertNothingWritten();
    }

    // ── Wynik dla każdej osoby ──────────────────────────────────────────────

    public function test_every_person_gets_a_result_in_request_order_and_one_refusal_does_not_undo_the_others(): void
    {
        $admin = $this->boundAccount('super_admin');
        $supervisor = User::factory()->role('instructor')->create();
        $previous = User::factory()->role('instructor')->create();

        $student = User::factory()->role('student')->create();
        $fresh = User::factory()->role('volunteer')->create();
        $missing = (int) User::query()->max('id') + 1000;
        $same = User::factory()->role('volunteer')->create();
        $moved = User::factory()->role('volunteer')->create();
        $instructor = User::factory()->role('instructor')->create();
        $blocked = User::factory()->role('volunteer')->create(['status' => 'blocked']);
        $anonymized = User::factory()->role('volunteer')->create(['status' => 'deleted', 'anonymized_at' => now()]);
        $coordinator = User::factory()->role('project_manager')->create();

        $this->assignWithSingleRoute($admin, $same, $supervisor);
        $this->assignWithSingleRoute($admin, $moved, $previous);

        $requested = [
            $student->id, $fresh->id, $missing, $same->id, $moved->id,
            $instructor->id, $blocked->id, $anonymized->id, $coordinator->id,
        ];
        $response = $this->withTokenOf($admin)
            ->postJson(self::ROUTE, ['supervisor_id' => $supervisor->id, 'user_ids' => $requested])
            ->assertOk();

        $refused = ['result' => 'refused', 'reason' => 'not_assignable'];
        $this->assertSame([
            'supervisor_id' => $supervisor->id,
            'results' => [
                ['user_id' => $student->id, ...$refused],
                ['user_id' => $fresh->id, 'result' => 'assigned', 'reason' => null],
                ['user_id' => $missing, 'result' => 'not_found', 'reason' => null],
                ['user_id' => $same->id, 'result' => 'unchanged', 'reason' => null],
                ['user_id' => $moved->id, 'result' => 'assigned', 'reason' => null],
                ['user_id' => $instructor->id, ...$refused],
                ['user_id' => $blocked->id, ...$refused],
                ['user_id' => $anonymized->id, ...$refused],
                ['user_id' => $coordinator->id, ...$refused],
            ],
            'summary' => ['requested' => 9, 'assigned' => 2, 'unchanged' => 1, 'refused' => 5, 'not_found' => 1],
        ], $response->json('data'));

        foreach ([$fresh, $same, $moved] as $person) {
            $this->assertSame([$supervisor->id], $this->activeSupervisorIds($person));
        }
        $this->assertSame(0, SupervisorAssignment::query()->whereIn('volunteer_id', [
            $student->id, $instructor->id, $blocked->id, $anonymized->id, $coordinator->id,
        ])->count());
        // Poprzednie przypisanie przeniesionej osoby jest zamknięte, nie usunięte.
        $this->assertSame(2, SupervisorAssignment::query()->where('volunteer_id', $moved->id)->count());
    }

    public function test_results_follow_the_request_order_not_the_identifier_order(): void
    {
        $admin = $this->boundAccount('project_manager');
        $supervisor = User::factory()->role('instructor')->create();
        [$first, $second, $third] = User::factory()->count(3)->role('volunteer')->create()->all();
        $requested = [$third->id, $first->id, $second->id];

        $response = $this->withTokenOf($admin)
            ->postJson(self::ROUTE, ['supervisor_id' => $supervisor->id, 'user_ids' => $requested])
            ->assertOk();

        $this->assertSame($requested, array_column($response->json('data.results'), 'user_id'));
    }

    public function test_refusal_codes_reveal_no_more_than_the_single_route(): void
    {
        $admin = $this->boundAccount('project_manager');
        $supervisor = User::factory()->role('instructor')->create();
        $student = User::factory()->role('student')->create();
        $instructor = User::factory()->role('instructor')->create();
        $missing = (int) User::query()->max('id') + 1000;

        // Trasa pojedyncza: jedna i ta sama odpowiedź dla każdej niewłaściwej roli, osobna dla braku osoby.
        $singleStudent = $this->withTokenOf($admin)->putJson($this->single($student), ['supervisor_id' => $supervisor->id]);
        $singleInstructor = $this->withTokenOf($admin)->putJson($this->single($instructor), ['supervisor_id' => $supervisor->id]);
        $singleMissing = $this->withTokenOf($admin)->putJson("/api/v1/admin/users/{$missing}/supervisor", ['supervisor_id' => $supervisor->id]);
        $singleStudent->assertStatus(422);
        $this->assertSame($singleStudent->json(), $singleInstructor->json());
        $singleMissing->assertNotFound();

        $results = $this->withTokenOf($admin)
            ->postJson(self::ROUTE, ['supervisor_id' => $supervisor->id, 'user_ids' => [$student->id, $instructor->id, $missing]])
            ->assertOk()
            ->json('data.results');

        // Bez roli, statusu, imienia ani komunikatu — tylko identyfikator z żądania i kod.
        foreach ($results as $result) {
            $this->assertSame(['user_id', 'result', 'reason'], array_keys($result));
        }
        $this->assertSame(
            array_diff_key($results[0], ['user_id' => true]),
            array_diff_key($results[1], ['user_id' => true]),
        );
        $this->assertSame(['result' => 'not_found', 'reason' => null], array_diff_key($results[2], ['user_id' => true]));
    }

    // ── Dziennik zdarzeń: ten sam wpis co na trasie pojedynczej ────────────

    public function test_each_assigned_person_gets_exactly_the_audit_entry_of_the_single_route(): void
    {
        $admin = $this->boundAccount('project_manager');
        $supervisor = User::factory()->role('instructor')->create();
        $viaSingle = User::factory()->role('volunteer')->create();
        $people = User::factory()->count(3)->role('volunteer')->create();

        $this->assignWithSingleRoute($admin, $viaSingle, $supervisor);
        $this->withTokenOf($admin)
            ->postJson(self::ROUTE, ['supervisor_id' => $supervisor->id, 'user_ids' => $people->pluck('id')->all()])
            ->assertOk()
            ->assertJsonPath('data.summary.assigned', 3);

        $reference = $this->auditShape($this->entriesFor('supervisor.assigned', $viaSingle)->sole());

        foreach ($people as $person) {
            $entries = $this->entriesFor('supervisor.assigned', $person);
            $this->assertCount(1, $entries, 'jeden wpis na osobę');
            $entry = $entries->sole();
            $this->assertSame($reference, $this->auditShape($entry));
            $this->assertSame((int) $admin->id, (int) $entry->actor_id);
            $this->assertSame(['volunteer_id' => $person->id, 'supervisor_id' => $supervisor->id], $entry->details);
            $this->assertSame(
                (int) SupervisorAssignment::query()->where('volunteer_id', $person->id)->sole()->id,
                (int) $entry->subject_id,
            );
        }
        $this->assertSame(4, AuditLogEntry::query()->count());
    }

    public function test_moving_people_from_another_supervisor_writes_the_same_entries_as_the_single_route(): void
    {
        $admin = $this->boundAccount('project_manager');
        $previous = User::factory()->role('instructor')->create();
        $next = User::factory()->role('instructor')->create();
        $viaSingle = User::factory()->role('volunteer')->create();
        $people = User::factory()->count(2)->role('volunteer')->create();

        foreach ([$viaSingle, ...$people->all()] as $person) {
            $this->assignWithSingleRoute($admin, $person, $previous);
        }
        $this->assignWithSingleRoute($admin, $viaSingle, $next);

        $this->withTokenOf($admin)
            ->postJson(self::ROUTE, ['supervisor_id' => $next->id, 'user_ids' => $people->pluck('id')->all()])
            ->assertOk()
            ->assertJsonPath('data.summary.assigned', 2);

        $referenceClosed = $this->auditShape($this->entriesFor('supervisor.unassigned', $viaSingle)->sole());
        $referenceAssigned = $this->auditShape($this->entriesFor('supervisor.assigned', $viaSingle)->last());

        foreach ($people as $person) {
            $closed = $this->entriesFor('supervisor.unassigned', $person);
            $this->assertCount(1, $closed);
            $this->assertSame($referenceClosed, $this->auditShape($closed->sole()));
            $this->assertSame(['volunteer_id' => $person->id, 'supervisor_id' => $previous->id], $closed->sole()->details);

            $assigned = $this->entriesFor('supervisor.assigned', $person);
            $this->assertCount(2, $assigned, 'przypisanie do poprzedniego i to jedno nowe');
            $this->assertSame($referenceAssigned, $this->auditShape($assigned->last()));
            $this->assertSame(['volunteer_id' => $person->id, 'supervisor_id' => $next->id], $assigned->last()->details);
        }
    }

    public function test_person_already_assigned_to_this_supervisor_is_unchanged_without_a_new_entry(): void
    {
        $admin = $this->boundAccount('project_manager');
        $supervisor = User::factory()->role('instructor')->create();
        $person = User::factory()->role('volunteer')->create();

        $this->assignWithSingleRoute($admin, $person, $supervisor);
        $before = AuditLogEntry::query()->count();

        $this->withTokenOf($admin)
            ->postJson(self::ROUTE, ['supervisor_id' => $supervisor->id, 'user_ids' => [$person->id]])
            ->assertOk()
            ->assertJsonPath('data.results.0.result', 'unchanged')
            ->assertJsonPath('data.summary.unchanged', 1);

        $this->assertSame($before, AuditLogEntry::query()->count());
        $this->assertSame(1, SupervisorAssignment::query()->where('volunteer_id', $person->id)->count());
    }

    public function test_assignment_sends_no_notification_and_no_email(): void
    {
        Notification::fake();
        Mail::fake();
        $admin = $this->boundAccount('project_manager');
        $supervisor = User::factory()->role('instructor')->create();
        $people = User::factory()->count(2)->role('volunteer')->create();

        $this->withTokenOf($admin)
            ->postJson(self::ROUTE, ['supervisor_id' => $supervisor->id, 'user_ids' => $people->pluck('id')->all()])
            ->assertOk();

        Notification::assertNothingSent();
        Mail::assertNothingOutgoing();
        $this->assertSame(0, DB::table('notifications')->count());
    }

    // ── Rozmowy: ta sama zmiana co po przypisaniu pojedynczym ──────────────

    public function test_conversations_change_for_every_moved_person_as_after_the_single_route(): void
    {
        Edition::factory()->create(['status' => 'active']);
        $admin = $this->boundAccount('project_manager');
        $previous = $this->boundAccount('instructor');
        $next = $this->boundAccount('instructor');
        $people = [$this->boundAccount('volunteer'), $this->boundAccount('volunteer')];

        $conversations = [];
        foreach ($people as $person) {
            $this->assignWithSingleRoute($admin, $person, $previous);
            $this->withTokenOf($person)->getJson('/api/v1/threads')->assertOk();
            $conversations[$person->id] = MessageThread::query()->where('type', 'individual')
                ->where('volunteer_id', $person->id)->where('supervisor_id', $previous->id)->sole()->id;
        }

        $this->withTokenOf($admin)
            ->postJson(self::ROUTE, ['supervisor_id' => $next->id, 'user_ids' => array_map(fn (User $p): int => $p->id, $people)])
            ->assertOk()
            ->assertJsonPath('data.summary.assigned', 2);

        foreach ($people as $person) {
            $old = $conversations[$person->id];

            // Poprzedni prowadzący traci rozmowę od razu.
            $this->withTokenOf($previous)->getJson("/api/v1/threads/{$old}")
                ->assertNotFound()->assertJsonPath('error.message', 'Nie znaleziono wątku.');
            $this->assertNotContains($old, $this->threadIds($this->withTokenOf($previous)->getJson('/api/v1/threads')));

            // Osoba zachowuje starą rozmowę tylko do odczytu.
            $this->withTokenOf($person)->getJson("/api/v1/threads/{$old}")
                ->assertOk()->assertJsonPath('meta.extra.read_only', true);
            $this->withTokenOf($person)->postJson("/api/v1/threads/{$old}/messages", ['body' => 'Piszę po zmianie.'])
                ->assertForbidden()->assertJsonPath('error.code', 'thread_closed');

            // Z nowym prowadzącym powstaje nowa rozmowa.
            $list = collect($this->withTokenOf($person)->getJson('/api/v1/threads')->assertOk()->json('data'));
            $current = $list->where('type', 'individual')->firstWhere('supervisor.id', $next->id);
            $this->assertNotNull($current);
            $this->assertNotSame($old, (int) $current['id']);
            $this->assertFalse($current['read_only']);
        }
    }

    // ── Pomocnicze ──────────────────────────────────────────────────────────

    private function routeFor(string $method): Route
    {
        $action = AdminSupervisionController::class.'@'.$method;
        $matches = collect(app('router')->getRoutes()->getRoutes())
            ->filter(fn (Route $route): bool => $route->getActionName() === $action)
            ->values();
        $this->assertCount(1, $matches, $action);

        return $matches->sole();
    }

    private function assignWithSingleRoute(User $admin, User $person, User $supervisor): void
    {
        $this->withTokenOf($admin)
            ->putJson($this->single($person), ['supervisor_id' => $supervisor->id])
            ->assertOk();
    }

    private function assertNothingWritten(): void
    {
        $this->assertSame(0, SupervisorAssignment::query()->count());
        $this->assertSame(0, AuditLogEntry::query()->count());
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
     * @return Collection<int, AuditLogEntry>
     */
    private function entriesFor(string $action, User $person): Collection
    {
        return AuditLogEntry::query()
            ->where('action', $action)
            ->orderBy('id')
            ->get()
            ->filter(fn (AuditLogEntry $entry): bool => (int) ($entry->details['volunteer_id'] ?? 0) === (int) $person->id)
            ->values();
    }

    /**
     * Postać wpisu bez wartości, które różnią się między osobami.
     *
     * @return array<string, mixed>
     */
    private function auditShape(AuditLogEntry $entry): array
    {
        return [
            'action' => $entry->action,
            'subject_type' => $entry->subject_type,
            'detail_keys' => array_keys($entry->details ?? []),
        ];
    }

    /**
     * @return list<int>
     */
    private function threadIds(TestResponse $response): array
    {
        return collect($response->assertOk()->json('data'))->pluck('id')->map(fn ($id): int => (int) $id)->all();
    }
}
