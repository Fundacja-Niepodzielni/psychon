<?php

namespace Tests\Feature\H18;

use App\Models\AuditLogEntry;
use App\Models\Edition;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\ActsWithRealmToken;
use Tests\TestCase;

/**
 * H18 · pula aktywnych kont administracji (Opiekun Projektu i Super Admin
 * razem) nie zostaje pusta po odebraniu roli ani po anonimizacji; własnego
 * konta nie anonimizuje nikt. Odmowy zapadają przed walidacją ciała.
 * Prawdziwe tokeny realmu.
 */
class LastActiveAdministratorTest extends TestCase
{
    use ActsWithRealmToken;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Edition::factory()->create(['status' => 'active']);
    }

    private function audits(string $action): int
    {
        return AuditLogEntry::query()->where('action', $action)->count();
    }

    /**
     * Osoba wywołująca z rolą Super Admina w tokenie, bez lokalnej roli
     * administracyjnej — jedynym aktywnym kontem administracji jest cel.
     * Konta zablokowane i czekające na powiązanie nie liczą się do puli.
     *
     * @return array{0: User, 1: User}
     */
    private function actorAndOnlyAdministrator(string $targetRole): array
    {
        $actor = $this->boundAccount('volunteer');
        $onlyAdmin = $this->boundAccount($targetRole);
        $this->boundAccount('super_admin', ['status' => 'blocked']);
        $this->boundAccount('project_manager', ['status' => 'invited', 'keycloak_sub' => null]);

        return [$actor, $onlyAdmin];
    }

    public function test_the_last_active_administrator_keeps_the_administration_role(): void
    {
        foreach (['project_manager', 'super_admin'] as $targetRole) {
            [$actor, $onlyAdmin] = $this->actorAndOnlyAdministrator($targetRole);

            foreach (['volunteer', 'instructor', 'student'] as $requested) {
                $this->withTokenOf($actor, 'super_admin')
                    ->patchJson("/api/v1/admin/users/{$onlyAdmin->id}", ['role' => $requested])
                    ->assertStatus(409)
                    ->assertJsonPath('error.code', 'last_active_administrator');
            }

            $this->assertSame($targetRole, $onlyAdmin->fresh()->role);
            User::query()->delete();
        }

        $this->assertSame(0, $this->audits('user.updated'));
    }

    public function test_the_only_super_admin_does_not_remove_their_own_administration_role(): void
    {
        $sa = $this->boundAccount('super_admin');

        $this->withTokenOf($sa)->patchJson("/api/v1/admin/users/{$sa->id}", ['role' => 'volunteer'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'last_active_administrator');

        $this->assertSame('super_admin', $sa->fresh()->role);
        $this->assertSame(0, $this->audits('user.updated'));
    }

    public function test_role_changes_that_keep_an_active_administrator_still_save(): void
    {
        [$actor, $onlyAdmin] = $this->actorAndOnlyAdministrator('super_admin');
        // Rolę Super Admina można oddać, gdy zostaje drugi powiązany Super Admin.
        $this->boundAccount('super_admin');

        // Przejście między rolami administracji nie zabiera roli administracyjnej.
        $this->withTokenOf($actor, 'super_admin')
            ->patchJson("/api/v1/admin/users/{$onlyAdmin->id}", ['role' => 'project_manager'])
            ->assertOk();
        $this->assertSame('project_manager', $onlyAdmin->fresh()->role);

        // Ta sama rola co zapisana razem z innym polem nie jest odebraniem.
        $this->withTokenOf($actor, 'super_admin')
            ->patchJson("/api/v1/admin/users/{$onlyAdmin->id}", ['role' => 'project_manager', 'first_name' => 'Nowe'])
            ->assertOk();

        // Drugie aktywne konto administracji — odebranie roli przechodzi.
        $second = $this->boundAccount('project_manager');
        $this->withTokenOf($actor, 'super_admin')
            ->patchJson("/api/v1/admin/users/{$onlyAdmin->id}", ['role' => 'volunteer'])
            ->assertOk();

        $this->assertSame('volunteer', $onlyAdmin->fresh()->role);
        $this->assertSame('project_manager', $second->fresh()->role);
    }

    public function test_the_last_active_administrator_is_not_anonymized(): void
    {
        foreach (['project_manager', 'super_admin'] as $targetRole) {
            [$actor, $onlyAdmin] = $this->actorAndOnlyAdministrator($targetRole);

            $this->withTokenOf($actor, 'super_admin')
                ->postJson("/api/v1/admin/users/{$onlyAdmin->id}/anonymize")
                ->assertStatus(409)
                ->assertJsonPath('error.code', 'last_active_administrator');

            $fresh = $onlyAdmin->fresh();
            $this->assertNull($fresh->anonymized_at);
            $this->assertSame($onlyAdmin->email, $fresh->email);
            User::query()->delete();
        }

        $this->assertSame(0, $this->audits('user.anonymized'));
    }

    public function test_nobody_anonymizes_their_own_account(): void
    {
        $sa = $this->boundAccount('super_admin');
        $this->boundAccount('super_admin');
        $this->boundAccount('project_manager');

        $this->withTokenOf($sa)->postJson("/api/v1/admin/users/{$sa->id}/anonymize")
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'cannot_anonymize_self');

        $this->assertNull($sa->fresh()->anonymized_at);
        $this->assertSame(0, $this->audits('user.anonymized'));
    }

    public function test_anonymizing_an_administrator_while_another_stays_active(): void
    {
        $sa = $this->boundAccount('super_admin');
        $pm = $this->boundAccount('project_manager');

        $this->withTokenOf($sa)->postJson("/api/v1/admin/users/{$pm->id}/anonymize")
            ->assertOk()
            ->assertJsonPath('data.account.status', 'deleted');

        $this->assertNotNull($pm->fresh()->anonymized_at);
        $this->assertNull(AuditLogEntry::query()->where('action', 'user.anonymized')->sole()->details);
    }

    public function test_refusals_come_before_the_body_is_validated(): void
    {
        [$actor, $onlyAdmin] = $this->actorAndOnlyAdministrator('project_manager');
        $pm = $this->boundAccount('project_manager', ['status' => 'blocked']);
        $invalidBodies = [[], ['reason' => ''], ['reason' => str_repeat('x', 5000)]];

        foreach ($invalidBodies as $body) {
            $this->withTokenOf($actor, 'super_admin')->postJson("/api/v1/admin/users/{$onlyAdmin->id}/block", $body)
                ->assertStatus(409)
                ->assertJsonPath('error.code', 'last_active_administrator');

            $this->withTokenOf($onlyAdmin)->postJson("/api/v1/admin/users/{$onlyAdmin->id}/block", $body)
                ->assertStatus(422)
                ->assertJsonPath('error.code', 'cannot_block_self');
        }

        foreach ([['role' => 'volunteer', 'email' => 'to-nie-adres'], ['role' => 'nieznana-rola'], ['role' => ['volunteer']]] as $body) {
            $this->withTokenOf($actor, 'super_admin')->patchJson("/api/v1/admin/users/{$onlyAdmin->id}", $body)
                ->assertStatus(409)
                ->assertJsonPath('error.code', 'last_active_administrator');
        }

        $this->withTokenOf($actor, 'super_admin')
            ->postJson("/api/v1/admin/users/{$onlyAdmin->id}/anonymize", ['reason' => str_repeat('x', 5000)])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'last_active_administrator');

        $this->assertSame('active', $onlyAdmin->fresh()->status);
        $this->assertSame('project_manager', $onlyAdmin->fresh()->role);
        $this->assertNull($onlyAdmin->fresh()->anonymized_at);
        $this->assertSame('blocked', $pm->fresh()->status);
        $this->assertSame(0, $this->audits('user.blocked') + $this->audits('user.updated') + $this->audits('user.anonymized'));
    }
}
