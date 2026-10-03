<?php

namespace Tests\Feature\H18;

use App\Models\AuditLogEntry;
use App\Models\Edition;
use App\Models\User;
use App\Services\H18\AccountManagementGuard;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\ActsWithRealmToken;
use Tests\TestCase;

/**
 * H18 · reguły zarządzania kontami: role administracyjne, blokada, anonimizacja
 * oraz kolejność odmów (dostęp przed walidacją ciała). Prawdziwe tokeny realmu.
 */
class AccountManagementRulesTest extends TestCase
{
    use ActsWithRealmToken;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Edition::factory()->create(['status' => 'active']);
    }

    /**
     * @return array<string, mixed>
     */
    private function newAccount(string $role, string $email): array
    {
        return ['first_name' => 'Celina', 'last_name' => 'Demo', 'email' => $email, 'role' => $role];
    }

    private function audits(string $action, ?int $actorId = null): int
    {
        return AuditLogEntry::query()->where('action', $action)
            ->when($actorId !== null, fn ($q) => $q->where('actor_id', $actorId))
            ->count();
    }

    public function test_project_manager_creates_only_non_administration_accounts(): void
    {
        $pm = $this->boundAccount('project_manager');

        $this->withTokenOf($pm)->postJson('/api/v1/admin/users', $this->newAccount('project_manager', 'pm.nowy@example.test'))
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden')
            ->assertJsonPath('error.message', AccountManagementGuard::ADMIN_ROLES_MESSAGE);

        $this->withTokenOf($pm)->postJson('/api/v1/admin/users', $this->newAccount('super_admin', 'sa.nowy@example.test'))
            ->assertStatus(403)
            ->assertJsonPath('error.message', AccountManagementGuard::SUPER_ADMIN_ACCOUNTS_MESSAGE);

        $this->assertSame(0, User::query()->whereIn('email', ['pm.nowy@example.test', 'sa.nowy@example.test'])->count());
        $this->assertSame(0, $this->audits('user.created'));

        foreach (['instructor', 'volunteer', 'student'] as $i => $role) {
            $this->withTokenOf($pm)->postJson('/api/v1/admin/users', $this->newAccount($role, "konto{$i}@example.test"))
                ->assertCreated();
        }
        $this->assertSame(3, $this->audits('user.created', $pm->id));
    }

    public function test_super_admin_creates_administration_accounts(): void
    {
        $sa = $this->boundAccount('super_admin');

        foreach (['project_manager', 'super_admin'] as $i => $role) {
            $this->withTokenOf($sa)->postJson('/api/v1/admin/users', $this->newAccount($role, "admin{$i}@example.test"))
                ->assertCreated()
                ->assertJsonPath('data.profile.role', $role);
        }
    }

    public function test_project_manager_does_not_write_an_administration_role(): void
    {
        $pm = $this->boundAccount('project_manager');
        $volunteer = $this->boundAccount('volunteer');
        $otherPm = $this->boundAccount('project_manager');

        $this->withTokenOf($pm)->patchJson("/api/v1/admin/users/{$volunteer->id}", ['role' => 'project_manager'])
            ->assertStatus(403)
            ->assertJsonPath('error.message', AccountManagementGuard::ADMIN_ROLES_MESSAGE);
        $this->assertSame('volunteer', $volunteer->fresh()->role);

        $this->withTokenOf($pm)->patchJson("/api/v1/admin/users/{$otherPm->id}", ['role' => 'volunteer'])
            ->assertStatus(403)
            ->assertJsonPath('error.message', AccountManagementGuard::ADMIN_ROLES_MESSAGE);
        $this->assertSame('project_manager', $otherPm->fresh()->role);

        $this->withTokenOf($pm)->patchJson("/api/v1/admin/users/{$pm->id}", ['role' => 'super_admin'])
            ->assertStatus(403)
            ->assertJsonPath('error.message', AccountManagementGuard::SUPER_ADMIN_ACCOUNTS_MESSAGE);
        $this->assertSame('project_manager', $pm->fresh()->role);

        $this->assertSame(0, $this->audits('user.updated'));
    }

    public function test_project_manager_saves_a_form_that_repeats_the_current_role(): void
    {
        $pm = $this->boundAccount('project_manager');
        $otherPm = $this->boundAccount('project_manager', ['first_name' => 'Przed']);
        $volunteer = $this->boundAccount('volunteer');

        $this->withTokenOf($pm)->patchJson("/api/v1/admin/users/{$otherPm->id}", ['first_name' => 'Po', 'role' => 'project_manager'])
            ->assertOk();
        $this->assertSame('Po', $otherPm->fresh()->first_name);

        $this->withTokenOf($pm)->patchJson("/api/v1/admin/users/{$volunteer->id}", ['role' => 'student'])
            ->assertOk();
        $this->assertSame('student', $volunteer->fresh()->role);
    }

    public function test_super_admin_changes_administration_roles(): void
    {
        $sa = $this->boundAccount('super_admin');
        $volunteer = $this->boundAccount('volunteer');
        $pm = $this->boundAccount('project_manager');

        $this->withTokenOf($sa)->patchJson("/api/v1/admin/users/{$volunteer->id}", ['role' => 'project_manager'])->assertOk();
        $this->withTokenOf($sa)->patchJson("/api/v1/admin/users/{$pm->id}", ['role' => 'volunteer'])->assertOk();

        $this->assertSame('project_manager', $volunteer->fresh()->role);
        $this->assertSame('volunteer', $pm->fresh()->role);
    }

    public function test_nobody_blocks_their_own_account(): void
    {
        $pm = $this->boundAccount('project_manager');
        $sa = $this->boundAccount('super_admin');

        foreach ([$pm, $sa] as $actor) {
            $this->withTokenOf($actor)->postJson("/api/v1/admin/users/{$actor->id}/block", ['reason' => 'Powód'])
                ->assertStatus(422)
                ->assertJsonPath('error.code', 'cannot_block_self');
            $this->assertSame('active', $actor->fresh()->status);
        }

        $this->assertSame(0, $this->audits('user.blocked'));
    }

    public function test_the_last_active_administration_account_stays_active(): void
    {
        // Osoba wywołująca z rolą w tokenie, ale bez lokalnej roli administracyjnej:
        // jedyne lokalne konto administracji to cel.
        $actor = $this->boundAccount('volunteer');
        $onlyAdmin = $this->boundAccount('project_manager');
        $this->boundAccount('super_admin', ['status' => 'blocked']);
        $this->boundAccount('project_manager', ['status' => 'invited', 'keycloak_sub' => null]);

        $this->withTokenOf($actor, 'super_admin')->postJson("/api/v1/admin/users/{$onlyAdmin->id}/block", ['reason' => 'Powód'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'last_active_administrator');

        $this->assertSame('active', $onlyAdmin->fresh()->status);
        $this->assertSame(0, $this->audits('user.blocked'));
    }

    public function test_blocking_another_administrator_while_one_stays_active(): void
    {
        $pm = $this->boundAccount('project_manager');
        $otherPm = $this->boundAccount('project_manager');

        $this->withTokenOf($pm)->postJson("/api/v1/admin/users/{$otherPm->id}/block", ['reason' => 'Powód'])->assertOk();
        $this->assertSame('blocked', $otherPm->fresh()->status);

        $this->withTokenOf($pm)->postJson("/api/v1/admin/users/{$pm->id}/block", ['reason' => 'Powód'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'cannot_block_self');

        $this->assertSame(1, User::query()->whereIn('role', AccountManagementGuard::ADMIN_ROLES)->where('status', 'active')->count());
    }

    public function test_anonymization_is_reserved_for_super_admin(): void
    {
        $pm = $this->boundAccount('project_manager');
        $sa = $this->boundAccount('super_admin');
        $otherPm = $this->boundAccount('project_manager', ['email' => 'inny.pm@example.test']);
        $volunteer = $this->boundAccount('volunteer', ['email' => 'wolontariusz@example.test']);

        foreach ([$otherPm, $volunteer] as $target) {
            $this->withTokenOf($pm)->postJson("/api/v1/admin/users/{$target->id}/anonymize")
                ->assertStatus(403)
                ->assertJsonPath('error.code', 'forbidden');
            $this->assertNull($target->fresh()->anonymized_at);
        }

        $missing = (int) User::query()->max('id') + 1000;
        $this->withTokenOf($pm)->postJson("/api/v1/admin/users/{$missing}/anonymize")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');

        $this->assertSame(2, User::query()->whereIn('email', ['inny.pm@example.test', 'wolontariusz@example.test'])->count());
        $this->assertSame(0, $this->audits('user.anonymized'));

        $this->withTokenOf($sa)->postJson("/api/v1/admin/users/{$volunteer->id}/anonymize")
            ->assertOk()
            ->assertJsonPath('data.account.status', 'deleted');

        $entry = AuditLogEntry::query()->where('action', 'user.anonymized')->sole();
        $this->assertSame($sa->id, $entry->actor_id);
        $this->assertNull($entry->details);
    }

    public function test_access_is_decided_before_the_body_is_validated(): void
    {
        $pm = $this->boundAccount('project_manager');
        $sa = $this->boundAccount('super_admin', ['email' => 'sa@example.test']);

        // Konto Super Admina: ta sama odmowa przy ciele poprawnym i błędnym.
        foreach ([['email' => 'nowy@example.test'], ['email' => 'to-nie-adres'], ['role' => 'nie-ma-takiej']] as $body) {
            $this->withTokenOf($pm)->patchJson("/api/v1/admin/users/{$sa->id}", $body)
                ->assertStatus(403)
                ->assertJsonPath('error.message', AccountManagementGuard::SUPER_ADMIN_ACCOUNTS_MESSAGE);
        }
        foreach ([['reason' => 'Powód'], [], ['reason' => str_repeat('x', 5000)]] as $body) {
            $this->withTokenOf($pm)->postJson("/api/v1/admin/users/{$sa->id}/block", $body)
                ->assertStatus(403)
                ->assertJsonPath('error.message', AccountManagementGuard::SUPER_ADMIN_ACCOUNTS_MESSAGE);
        }
        $this->assertSame('sa@example.test', $sa->fresh()->email);
        $this->assertSame('active', $sa->fresh()->status);

        // Rola administracyjna w nowym koncie: odmowa także przy niepełnym ciele.
        $this->withTokenOf($pm)->postJson('/api/v1/admin/users', ['role' => 'project_manager'])
            ->assertStatus(403)
            ->assertJsonPath('error.message', AccountManagementGuard::ADMIN_ROLES_MESSAGE);
    }

    public function test_missing_account_gives_one_identical_404_whatever_the_body(): void
    {
        $sa = $this->boundAccount('super_admin');
        $missing = (int) User::query()->max('id') + 1000;

        $requests = [
            ['PATCH', "/api/v1/admin/users/{$missing}", ['first_name' => 'X']],
            ['PATCH', "/api/v1/admin/users/{$missing}", ['email' => 'to-nie-adres']],
            ['PATCH', "/api/v1/admin/users/{$missing}", []],
            ['POST', "/api/v1/admin/users/{$missing}/block", ['reason' => 'Powód']],
            ['POST', "/api/v1/admin/users/{$missing}/block", []],
            ['POST', "/api/v1/admin/users/{$missing}/anonymize", []],
            ['GET', "/api/v1/admin/users/{$missing}", []],
        ];

        $bodies = [];
        foreach ($requests as [$method, $uri, $body]) {
            $response = $this->withTokenOf($sa)->json($method, $uri, $body);
            $response->assertStatus(404);
            $bodies[] = $response->getContent();
        }

        $this->assertCount(1, array_unique($bodies));
        $this->assertSame('not_found', json_decode($bodies[0], true)['error']['code']);
    }
}
