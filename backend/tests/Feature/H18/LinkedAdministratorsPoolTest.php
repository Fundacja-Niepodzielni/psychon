<?php

namespace Tests\Feature\H18;

use App\Models\AuditLogEntry;
use App\Models\Edition;
use App\Models\User;
use App\Services\H18\AccountManagementGuard;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\ActsWithRealmToken;
use Tests\TestCase;

/**
 * H18 · pula „ostatniego aktywnego administratora” liczy wyłącznie konta
 * z powiązaną tożsamością Kont Niepodzielni (`users.keycloak_sub` — ktoś
 * zalogował się co najmniej raz). Konto założone w panelu, które czeka na
 * pierwsze logowanie, nie utrzymuje panelu przy życiu. Ta sama reguła dla
 * roli Super Admina: nikt nie odbiera jej ostatniemu powiązanemu kontu
 * Super Admina, także sobie samemu. Odpowiedź ta sama co dla „ostatniego
 * administratora”. Prawdziwe tokeny realmu.
 */
class LinkedAdministratorsPoolTest extends TestCase
{
    use ActsWithRealmToken;
    use RefreshDatabase;

    private const LAST_ADMIN_MESSAGE = 'To ostatnie aktywne konto administracji. Najpierw nadaj tę rolę innej osobie.';

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
     * Konto założone w panelu: aktywne, z tokenem zaproszenia, bez powiązania.
     */
    private function neverLoggedIn(string $role): User
    {
        return User::factory()->role($role)->invited()->create(['status' => 'active', 'keycloak_sub' => null]);
    }

    private function assertLastAdministratorRefusal(TestResponse $response): void
    {
        $response->assertStatus(409)
            ->assertJsonPath('error.code', 'last_active_administrator')
            ->assertJsonPath('error.message', self::LAST_ADMIN_MESSAGE);
    }

    public function test_an_account_that_never_logged_in_does_not_keep_the_administration_alive(): void
    {
        $sa = $this->boundAccount('super_admin');
        $waiting = $this->neverLoggedIn('project_manager');

        foreach (['volunteer', 'project_manager'] as $requested) {
            $this->assertLastAdministratorRefusal(
                $this->withTokenOf($sa)->patchJson("/api/v1/admin/users/{$sa->id}", ['role' => $requested])
            );
        }

        // Zablokowanie siebie pozostaje odmową własnego konta, a nie wyjątkiem puli.
        $this->withTokenOf($sa)->postJson("/api/v1/admin/users/{$sa->id}/block", ['reason' => 'Powód'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'cannot_block_self');

        // Cudzą ręką — osoba wywołująca z rolą w tokenie, bez lokalnej roli administracyjnej.
        $actor = $this->boundAccount('volunteer');

        $this->assertLastAdministratorRefusal(
            $this->withTokenOf($actor, 'super_admin')->postJson("/api/v1/admin/users/{$sa->id}/block", ['reason' => 'Powód'])
        );
        $this->assertLastAdministratorRefusal(
            $this->withTokenOf($actor, 'super_admin')->postJson("/api/v1/admin/users/{$sa->id}/anonymize")
        );

        $fresh = $sa->fresh();
        $this->assertSame('super_admin', $fresh->role);
        $this->assertSame('active', $fresh->status);
        $this->assertNull($fresh->anonymized_at);
        $this->assertSame('active', $waiting->fresh()->status);
        $this->assertSame(0, $this->audits('user.updated') + $this->audits('user.blocked') + $this->audits('user.anonymized'));
    }

    public function test_the_only_linked_project_manager_is_not_blocked_while_an_unlinked_one_waits(): void
    {
        $actor = $this->boundAccount('volunteer');
        $linked = $this->boundAccount('project_manager');
        $this->neverLoggedIn('project_manager');
        $this->neverLoggedIn('super_admin');

        $this->assertLastAdministratorRefusal(
            $this->withTokenOf($actor, 'super_admin')->postJson("/api/v1/admin/users/{$linked->id}/block", ['reason' => 'Powód'])
        );
        $this->assertLastAdministratorRefusal(
            $this->withTokenOf($actor, 'super_admin')->patchJson("/api/v1/admin/users/{$linked->id}", ['role' => 'volunteer'])
        );
        $this->assertLastAdministratorRefusal(
            $this->withTokenOf($actor, 'super_admin')->postJson("/api/v1/admin/users/{$linked->id}/anonymize")
        );

        $this->assertSame('active', $linked->fresh()->status);
        $this->assertSame('project_manager', $linked->fresh()->role);
        $this->assertNull($linked->fresh()->anonymized_at);
    }

    public function test_the_last_linked_super_admin_keeps_the_role_while_a_linked_project_manager_stays(): void
    {
        $sa = $this->boundAccount('super_admin');
        $pm = $this->boundAccount('project_manager');

        foreach (['volunteer', 'instructor', 'project_manager'] as $requested) {
            $this->assertLastAdministratorRefusal(
                $this->withTokenOf($sa)->patchJson("/api/v1/admin/users/{$sa->id}", ['role' => $requested])
            );
        }

        // Cudzą ręką: osoba wywołująca z rolą Super Admina w tokenie, konto lokalne bez roli administracji.
        $actor = $this->boundAccount('volunteer');
        $this->assertLastAdministratorRefusal(
            $this->withTokenOf($actor, 'super_admin')->patchJson("/api/v1/admin/users/{$sa->id}", ['role' => 'project_manager', 'first_name' => 'Zmiana'])
        );

        $this->assertSame('super_admin', $sa->fresh()->role);
        $this->assertNotSame('Zmiana', $sa->fresh()->first_name);
        $this->assertSame(0, $this->audits('user.updated'));

        // Opiekun w puli nie jest tu przeszkodą dla własnej roli Opiekuna: zostaje Super Admin.
        $this->withTokenOf($sa)->patchJson("/api/v1/admin/users/{$pm->id}", ['role' => 'volunteer'])->assertOk();
        $this->withTokenOf($sa)->postJson("/api/v1/admin/users/{$sa->id}/block", ['reason' => 'Powód'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'cannot_block_self');
    }

    public function test_a_linked_project_manager_is_blocked_while_a_linked_super_admin_stays(): void
    {
        $sa = $this->boundAccount('super_admin');
        $pm = $this->boundAccount('project_manager');

        $this->withTokenOf($sa)->postJson("/api/v1/admin/users/{$pm->id}/block", ['reason' => 'Powód'])->assertOk();

        $this->assertSame('blocked', $pm->fresh()->status);
        $this->assertSame(1, AccountManagementGuard::activeAdministratorPool()->count());
    }

    public function test_with_two_linked_super_admins_one_of_them_gives_up_the_role(): void
    {
        $first = $this->boundAccount('super_admin');
        $second = $this->boundAccount('super_admin');

        $this->withTokenOf($first)->patchJson("/api/v1/admin/users/{$second->id}", ['role' => 'volunteer'])->assertOk();
        $this->assertSame('volunteer', $second->fresh()->role);

        // Pierwszy został jedynym — jego roli nie odbierze już nikt, także on sam.
        $this->assertLastAdministratorRefusal(
            $this->withTokenOf($first)->patchJson("/api/v1/admin/users/{$first->id}", ['role' => 'project_manager'])
        );
        $this->assertSame('super_admin', $first->fresh()->role);
        $this->assertSame(1, $this->audits('user.updated'));
    }

    /**
     * Sprawdzenie ostatniego Super Admina stoi przed walidacją ciała: odmowa
     * 409 wygrywa z błędem pola. Opiekun w puli zdejmuje z drogi regułę
     * „ostatniego administratora”, więc to sprawdzenie jest tu jedynym strażnikiem.
     */
    public function test_the_last_super_admin_refusal_comes_before_body_validation(): void
    {
        $sa = $this->boundAccount('super_admin');
        $this->boundAccount('project_manager');

        $this->assertLastAdministratorRefusal(
            $this->withTokenOf($sa)->patchJson("/api/v1/admin/users/{$sa->id}", [
                'role' => 'volunteer',
                'email' => 'to-nie-jest-adres',
            ])
        );

        // Kontrola dodatnia: ten sam błąd pola przy zmianie, która nie odbiera roli Super Admina → 422.
        $this->withTokenOf($sa)->patchJson("/api/v1/admin/users/{$sa->id}", ['email' => 'to-nie-jest-adres'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertSame('super_admin', $sa->fresh()->role);
        $this->assertSame(0, $this->audits('user.updated'));
    }

    /**
     * Konto z pustym napisem w `keycloak_sub` nie jest powiązane — to samo co brak wartości.
     */
    public function test_an_account_with_an_empty_sub_does_not_count_towards_the_pool(): void
    {
        $linked = $this->boundAccount('super_admin');
        User::factory()->role('project_manager')->create(['status' => 'active', 'keycloak_sub' => '']);
        $actor = $this->boundAccount('volunteer');

        $this->assertSame(1, AccountManagementGuard::activeAdministratorPool()->count());

        $this->assertLastAdministratorRefusal(
            $this->withTokenOf($actor, 'super_admin')->postJson("/api/v1/admin/users/{$linked->id}/block", ['reason' => 'Powód'])
        );

        $this->assertSame('active', $linked->fresh()->status);
        $this->assertSame(0, $this->audits('user.blocked'));
    }

    public function test_a_super_admin_who_never_logged_in_does_not_count_as_the_remaining_one(): void
    {
        $linked = $this->boundAccount('super_admin');
        $waiting = $this->neverLoggedIn('super_admin');
        $pm = $this->boundAccount('project_manager');
        $actor = $this->boundAccount('volunteer');

        $this->assertLastAdministratorRefusal(
            $this->withTokenOf($actor, 'super_admin')->patchJson("/api/v1/admin/users/{$linked->id}", ['role' => 'project_manager'])
        );

        // Zmiana roli samego oczekującego konta niczego nie odbiera puli.
        $this->withTokenOf($actor, 'super_admin')->patchJson("/api/v1/admin/users/{$waiting->id}", ['role' => 'volunteer'])->assertOk();
        $this->assertSame('super_admin', $linked->fresh()->role);
        $this->assertSame('project_manager', $pm->fresh()->role);
    }
}
