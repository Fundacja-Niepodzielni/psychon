<?php

namespace Tests\Feature\H12;

use App\Models\AuditLogEntry;
use App\Models\SupervisorAssignment;
use App\Models\User;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\ActsWithRealmToken;
use Tests\TestCase;

/**
 * Przypisanie prowadzącego jednej osobie (`PUT /admin/users/{id}/supervisor`)
 * stosuje te same warunki co przypisanie wielu osobom
 * (`POST /admin/supervisor-assignments`): prowadzącym może być tylko aktywne,
 * niezanonimizowane konto z rolą prowadzącego, a prowadzącego dostaje tylko
 * wolontariusz, którego konto nie jest zablokowane, usunięte ani
 * zanonimizowane. Odmowa to `422 validation_failed` z polskim komunikatem i
 * niczego nie zapisuje — ani przypisania, ani wpisu w dzienniku zdarzeń.
 */
class SupervisorAssignmentSingleRouteRulesTest extends TestCase
{
    use ActsWithRealmToken;
    use RefreshDatabase;

    private const string BULK_ROUTE = '/api/v1/admin/supervisor-assignments';

    private const string PERSON_REFUSED = 'Prowadzącego można nadać tylko wolontariuszowi, którego konto nie jest zablokowane ani usunięte.';

    private const string SUPERVISOR_REFUSED = 'Prowadzącym może być tylko aktywne konto z rolą prowadzącego.';

    private function single(int $personId): string
    {
        return "/api/v1/admin/users/{$personId}/supervisor";
    }

    // ── Osoba ───────────────────────────────────────────────────────────────

    /**
     * @return array<string, array{0: array<string, mixed>}>
     */
    public static function peopleWhoCannotBeAssigned(): array
    {
        return [
            'konto zablokowane' => [['status' => 'blocked']],
            'konto usunięte' => [['status' => 'deleted']],
            'konto zanonimizowane' => [['status' => 'deleted', 'anonymized_at' => '2026-09-01 10:00:00']],
            'konto zanonimizowane z innym stanem' => [['status' => 'active', 'anonymized_at' => '2026-09-01 10:00:00']],
        ];
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    #[DataProvider('peopleWhoCannotBeAssigned')]
    public function test_person_whose_account_is_closed_is_refused_and_nothing_is_written(array $attributes): void
    {
        $admin = $this->boundAccount('project_manager');
        $supervisor = User::factory()->role('instructor')->create();
        $person = User::factory()->role('volunteer')->create($attributes);

        $this->withTokenOf($admin)
            ->putJson($this->single($person->id), ['supervisor_id' => $supervisor->id])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.message', self::PERSON_REFUSED);

        $this->assertSame(0, SupervisorAssignment::query()->count());
        $this->assertSame(0, AuditLogEntry::query()->count());
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    #[DataProvider('peopleWhoCannotBeAssigned')]
    public function test_closed_account_keeps_its_previous_assignment_untouched(array $attributes): void
    {
        $admin = $this->boundAccount('project_manager');
        $previous = User::factory()->role('instructor')->create();
        $next = User::factory()->role('instructor')->create();
        $person = User::factory()->role('volunteer')->create();
        $existing = SupervisorAssignment::query()->create([
            'volunteer_id' => $person->id,
            'supervisor_id' => $previous->id,
            'assigned_at' => now()->subWeek(),
        ]);
        $person->forceFill($attributes)->save();

        $this->withTokenOf($admin)
            ->putJson($this->single($person->id), ['supervisor_id' => $next->id])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.message', self::PERSON_REFUSED);

        $this->assertSame([(int) $existing->id], SupervisorAssignment::query()->pluck('id')->map(fn ($id): int => (int) $id)->all());
        $this->assertNull($existing->fresh()?->unassigned_at);
        $this->assertSame((int) $previous->id, (int) $existing->fresh()?->supervisor_id);
        $this->assertSame(0, AuditLogEntry::query()->count());
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function rolesOtherThanVolunteer(): array
    {
        return [
            'prowadzący' => ['instructor'],
            'student' => ['student'],
            'koordynator' => ['project_manager'],
        ];
    }

    #[DataProvider('rolesOtherThanVolunteer')]
    public function test_person_with_another_role_is_refused_with_the_same_message(string $role): void
    {
        $admin = $this->boundAccount('project_manager');
        $supervisor = User::factory()->role('instructor')->create();
        $person = User::factory()->role($role)->create();

        $this->withTokenOf($admin)
            ->putJson($this->single($person->id), ['supervisor_id' => $supervisor->id])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.message', self::PERSON_REFUSED);

        $this->assertSame(0, SupervisorAssignment::query()->count());
        $this->assertSame(0, AuditLogEntry::query()->count());
    }

    // ── Prowadzący ──────────────────────────────────────────────────────────

    /**
     * @return array<string, array{0: Closure(): User}>
     */
    public static function supervisorsNotAllowed(): array
    {
        return [
            'zablokowany prowadzący' => [fn (): User => User::factory()->role('instructor')->create(['status' => 'blocked'])],
            'prowadzący z niewykorzystanym zaproszeniem' => [fn (): User => User::factory()->role('instructor')->create(['status' => 'invited'])],
            'usunięte konto prowadzącego' => [fn (): User => User::factory()->role('instructor')->create(['status' => 'deleted'])],
            'zanonimizowany prowadzący' => [fn (): User => User::factory()->role('instructor')->create(['status' => 'deleted', 'anonymized_at' => now()])],
            'zanonimizowany prowadzący z innym stanem' => [fn (): User => User::factory()->role('instructor')->create(['status' => 'active', 'anonymized_at' => now()])],
            'konto wolontariusza' => [fn (): User => User::factory()->role('volunteer')->create()],
            'konto koordynatora' => [fn (): User => User::factory()->role('project_manager')->create()],
            'konto studenta' => [fn (): User => User::factory()->role('student')->create()],
        ];
    }

    /**
     * @param  Closure(): User  $makeSupervisor
     */
    #[DataProvider('supervisorsNotAllowed')]
    public function test_supervisor_must_be_an_active_instructor_and_nothing_is_written(Closure $makeSupervisor): void
    {
        $admin = $this->boundAccount('project_manager');
        $supervisor = $makeSupervisor();
        $person = User::factory()->role('volunteer')->create();

        $this->withTokenOf($admin)
            ->putJson($this->single($person->id), ['supervisor_id' => $supervisor->id])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.message', self::SUPERVISOR_REFUSED);

        $this->assertSame(0, SupervisorAssignment::query()->count());
        $this->assertSame(0, AuditLogEntry::query()->count());
    }

    /**
     * @param  Closure(): User  $makeSupervisor
     */
    #[DataProvider('supervisorsNotAllowed')]
    public function test_supervisor_not_allowed_does_not_replace_the_current_one(Closure $makeSupervisor): void
    {
        $admin = $this->boundAccount('project_manager');
        $current = User::factory()->role('instructor')->create();
        $person = User::factory()->role('volunteer')->create();
        $this->withTokenOf($admin)
            ->putJson($this->single($person->id), ['supervisor_id' => $current->id])
            ->assertOk();
        $entriesBefore = AuditLogEntry::query()->count();

        $this->withTokenOf($admin)
            ->putJson($this->single($person->id), ['supervisor_id' => $makeSupervisor()->id])
            ->assertStatus(422)
            ->assertJsonPath('error.message', self::SUPERVISOR_REFUSED);

        $rows = SupervisorAssignment::query()->where('volunteer_id', $person->id)->get();
        $this->assertCount(1, $rows);
        $this->assertSame((int) $current->id, (int) $rows->sole()->supervisor_id);
        $this->assertNull($rows->sole()->unassigned_at);
        $this->assertSame($entriesBefore, AuditLogEntry::query()->count());
    }

    // ── Te same warunki na obu trasach ─────────────────────────────────────

    /**
     * Stan konta osoby i oczekiwany wynik: czy obie trasy przypisują.
     *
     * @return array<string, array{0: array<string, mixed>, 1: bool}>
     */
    public static function personStates(): array
    {
        return [
            'aktywne konto' => [['status' => 'active'], true],
            'niewykorzystane zaproszenie' => [['status' => 'invited'], true],
            'konto zablokowane' => [['status' => 'blocked'], false],
            'konto usunięte' => [['status' => 'deleted'], false],
            'konto zanonimizowane' => [['status' => 'deleted', 'anonymized_at' => '2026-09-01 10:00:00'], false],
            'konto zanonimizowane z innym stanem' => [['status' => 'active', 'anonymized_at' => '2026-09-01 10:00:00'], false],
        ];
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    #[DataProvider('personStates')]
    public function test_both_routes_decide_the_same_for_every_person_state(array $attributes, bool $assignable): void
    {
        $admin = $this->boundAccount('project_manager');
        $supervisor = User::factory()->role('instructor')->create();
        $viaSingle = User::factory()->role('volunteer')->create($attributes);
        $viaBulk = User::factory()->role('volunteer')->create($attributes);

        $single = $this->withTokenOf($admin)
            ->putJson($this->single($viaSingle->id), ['supervisor_id' => $supervisor->id]);
        $bulk = $this->withTokenOf($admin)
            ->postJson(self::BULK_ROUTE, ['supervisor_id' => $supervisor->id, 'user_ids' => [$viaBulk->id]])
            ->assertOk();

        if ($assignable) {
            $single->assertOk()->assertJsonPath('data.supervisor_id', $supervisor->id);
            $bulk->assertJsonPath('data.results.0', ['user_id' => $viaBulk->id, 'result' => 'assigned', 'reason' => null]);
            $this->assertSame(2, SupervisorAssignment::query()->whereNull('unassigned_at')->count());
            $this->assertSame(2, AuditLogEntry::query()->where('action', 'supervisor.assigned')->count());
        } else {
            $single->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');
            $bulk->assertJsonPath('data.results.0', ['user_id' => $viaBulk->id, 'result' => 'refused', 'reason' => 'not_assignable']);
            $this->assertSame(0, SupervisorAssignment::query()->count());
            $this->assertSame(0, AuditLogEntry::query()->count());
        }
    }

    /**
     * Stan konta prowadzącego i oczekiwany wynik: czy obie trasy go przyjmują.
     *
     * @return array<string, array{0: string, 1: array<string, mixed>, 2: bool}>
     */
    public static function supervisorStates(): array
    {
        return [
            'aktywny prowadzący' => ['instructor', ['status' => 'active'], true],
            'zablokowany prowadzący' => ['instructor', ['status' => 'blocked'], false],
            'prowadzący z niewykorzystanym zaproszeniem' => ['instructor', ['status' => 'invited'], false],
            'usunięte konto prowadzącego' => ['instructor', ['status' => 'deleted'], false],
            'zanonimizowany prowadzący' => ['instructor', ['status' => 'deleted', 'anonymized_at' => '2026-09-01 10:00:00'], false],
            'zanonimizowany prowadzący z innym stanem' => ['instructor', ['status' => 'active', 'anonymized_at' => '2026-09-01 10:00:00'], false],
            'aktywne konto wolontariusza' => ['volunteer', ['status' => 'active'], false],
        ];
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    #[DataProvider('supervisorStates')]
    public function test_both_routes_accept_the_same_supervisors(string $role, array $attributes, bool $allowed): void
    {
        $admin = $this->boundAccount('project_manager');
        $supervisor = User::factory()->role($role)->create($attributes);
        $viaSingle = User::factory()->role('volunteer')->create();
        $viaBulk = User::factory()->role('volunteer')->create();

        $single = $this->withTokenOf($admin)
            ->putJson($this->single($viaSingle->id), ['supervisor_id' => $supervisor->id]);
        $bulk = $this->withTokenOf($admin)
            ->postJson(self::BULK_ROUTE, ['supervisor_id' => $supervisor->id, 'user_ids' => [$viaBulk->id]]);

        if ($allowed) {
            $single->assertOk();
            $bulk->assertOk()->assertJsonPath('data.results.0.result', 'assigned');
            $this->assertSame(2, SupervisorAssignment::query()->count());
        } else {
            $single->assertStatus(422)
                ->assertJsonPath('error.code', 'validation_failed')
                ->assertJsonPath('error.message', self::SUPERVISOR_REFUSED);
            $bulk->assertStatus(422)
                ->assertJsonPath('error.code', 'validation_failed')
                ->assertJsonPath('error.errors.supervisor_id.0', self::SUPERVISOR_REFUSED);
            $this->assertSame(0, SupervisorAssignment::query()->count());
            $this->assertSame(0, AuditLogEntry::query()->count());
        }
    }

    // ── Przypadki dozwolone bez zmian ──────────────────────────────────────

    public function test_active_volunteer_gets_the_active_supervisor_with_one_entry(): void
    {
        $admin = $this->boundAccount('super_admin');
        $supervisor = User::factory()->role('instructor')->create();
        $person = User::factory()->role('volunteer')->create();

        $this->withTokenOf($admin)
            ->putJson($this->single($person->id), ['supervisor_id' => $supervisor->id])
            ->assertOk()
            ->assertJsonPath('data.supervisor_id', $supervisor->id)
            ->assertJsonPath('data.unassigned_at', null);

        $entry = AuditLogEntry::query()->sole();
        $this->assertSame('supervisor.assigned', $entry->action);
        $this->assertSame(['volunteer_id' => $person->id, 'supervisor_id' => $supervisor->id], $entry->details);
    }

    public function test_missing_person_is_still_not_found(): void
    {
        $admin = $this->boundAccount('project_manager');
        $supervisor = User::factory()->role('instructor')->create(['status' => 'blocked']);
        $missing = (int) User::query()->max('id') + 1000;

        $this->withTokenOf($admin)
            ->putJson($this->single($missing), ['supervisor_id' => $supervisor->id])
            ->assertNotFound()
            ->assertJsonPath('error.code', 'not_found');

        $this->assertSame(0, AuditLogEntry::query()->count());
    }
}
