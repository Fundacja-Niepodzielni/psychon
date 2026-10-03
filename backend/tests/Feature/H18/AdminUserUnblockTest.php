<?php

namespace Tests\Feature\H18;

use App\Models\AuditLogEntry;
use App\Models\EmailMessage;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Tests\Concerns\ActsAsRole;
use Tests\Support\Sso\KeycloakTokenFactory;
use Tests\TestCase;

/**
 * Pakiet H18 · POST /admin/users/{id}/unblock — odblokowanie konta
 * (kontrakt, aneks z 2026-10-02) oraz odmowa blokady konta zanonimizowanego.
 */
class AdminUserUnblockTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    private function blockedBound(array $attributes = []): User
    {
        return User::factory()->role('volunteer')->create(array_merge([
            'status' => 'blocked',
            'keycloak_sub' => (string) Str::uuid(),
        ], $attributes));
    }

    private function unblockAudits(User $user): int
    {
        return AuditLogEntry::query()
            ->where('action', 'user.unblocked')
            ->where('subject_id', $user->id)
            ->count();
    }

    public function test_unblocks_a_blocked_account_and_records_audit(): void
    {
        $admin = $this->actingAsRole('super_admin');
        $person = $this->blockedBound();

        $this->postJson("/api/v1/admin/users/{$person->id}/unblock")
            ->assertOk()
            ->assertJsonPath('data.profile.id', $person->id)
            ->assertJsonPath('data.account.status', 'active');

        $this->assertSame('active', $person->fresh()->status);

        $entries = AuditLogEntry::query()
            ->where('action', 'user.unblocked')
            ->where('subject_id', $person->id)
            ->get();

        $this->assertCount(1, $entries);
        $this->assertSame($admin->id, $entries[0]->actor_id);
        $this->assertSame(
            ['previous_status' => 'blocked', 'restored_status' => 'active'],
            $entries[0]->details,
        );
    }

    public function test_project_manager_unblocks_a_volunteer(): void
    {
        $this->actingAsRole('project_manager');
        $person = $this->blockedBound();

        $this->postJson("/api/v1/admin/users/{$person->id}/unblock")
            ->assertOk()
            ->assertJsonPath('data.account.status', 'active');

        $this->assertSame(1, $this->unblockAudits($person));
    }

    /**
     * Ciało jest ignorowane: tekst wysłany obok żądania nie trafia ani do
     * wiersza, ani do ładunku audytu (rejestr bez wolnego tekstu).
     */
    public function test_body_is_ignored_and_audit_carries_no_free_text(): void
    {
        $this->actingAsRole('super_admin');
        $person = $this->blockedBound();

        $this->postJson("/api/v1/admin/users/{$person->id}/unblock", [
            'reason' => 'Tekst, który nie może trafić do dziennika.',
            'status' => 'active',
        ])->assertOk();

        $entry = AuditLogEntry::query()
            ->where('action', 'user.unblocked')
            ->where('subject_id', $person->id)
            ->firstOrFail();

        $this->assertSame(['previous_status', 'restored_status'], array_keys($entry->details));
        $this->assertStringNotContainsString('dziennika', (string) json_encode($entry->details));
    }

    public function test_unblocked_person_passes_the_guard_again(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();

        $adminSub = (string) Str::uuid();
        User::factory()->role('super_admin')->create(['keycloak_sub' => $adminSub]);
        $adminToken = $realm->mint(['sub' => $adminSub, 'realm_access' => ['roles' => ['admin-fundacja']]]);

        $personSub = (string) Str::uuid();
        $person = $this->blockedBound(['keycloak_sub' => $personSub]);
        $personToken = $realm->mint(['sub' => $personSub, 'realm_access' => ['roles' => ['wolontariusz']]]);

        $this->withHeader('Authorization', 'Bearer '.$personToken)
            ->getJson('/api/v1/me')
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'konto_zablokowane');

        // Każde żądanie rozstrzyga strażnik od nowa — jak dwa osobne żądania w produkcji.
        $this->app['auth']->forgetGuards();

        $this->withHeader('Authorization', 'Bearer '.$adminToken)
            ->postJson("/api/v1/admin/users/{$person->id}/unblock")
            ->assertOk()
            ->assertJsonPath('data.account.status', 'active');

        $this->app['auth']->forgetGuards();

        $this->withHeader('Authorization', 'Bearer '.$personToken)
            ->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.id', $person->id);
    }

    public function test_unblock_restores_invited_for_an_account_never_bound(): void
    {
        $this->actingAsRole('super_admin');
        $person = User::factory()->role('volunteer')->invited()->create([
            'status' => 'blocked',
            'keycloak_sub' => null,
        ]);

        $this->postJson("/api/v1/admin/users/{$person->id}/unblock")
            ->assertOk()
            ->assertJsonPath('data.account.status', 'invited');

        $this->assertSame('invited', $person->fresh()->status);

        $entry = AuditLogEntry::query()
            ->where('action', 'user.unblocked')
            ->where('subject_id', $person->id)
            ->firstOrFail();
        $this->assertSame(
            ['previous_status' => 'blocked', 'restored_status' => 'invited'],
            $entry->details,
        );
    }

    public function test_unblock_does_not_change_access_expiry(): void
    {
        $this->actingAsRole('super_admin');
        $expiry = Carbon::parse('2026-11-15T10:00:00Z');
        $person = $this->blockedBound(['access_expires_at' => $expiry]);

        $this->postJson("/api/v1/admin/users/{$person->id}/unblock")->assertOk();

        $this->assertTrue($person->fresh()->access_expires_at->equalTo($expiry));
    }

    public function test_card_exposes_account_status(): void
    {
        $this->actingAsRole('super_admin');

        foreach (['active', 'invited', 'blocked'] as $status) {
            $person = User::factory()->role('volunteer')->create(['status' => $status]);

            $this->getJson("/api/v1/admin/users/{$person->id}")
                ->assertOk()
                ->assertJsonPath('data.account.status', $status);
        }

        $anonymized = User::factory()->role('volunteer')->create([
            'status' => 'deleted',
            'anonymized_at' => now(),
        ]);

        $this->getJson("/api/v1/admin/users/{$anonymized->id}")
            ->assertOk()
            ->assertJsonPath('data.account.status', 'deleted');
    }

    public function test_instructor_volunteer_and_student_cannot_unblock(): void
    {
        $person = $this->blockedBound();

        foreach (['instructor', 'volunteer', 'student'] as $role) {
            $this->actingAsRole($role);

            $this->postJson("/api/v1/admin/users/{$person->id}/unblock")
                ->assertStatus(403)
                ->assertJsonPath('error.code', 'forbidden');

            // Ta sama odmowa także dla nieistniejącej osoby — rola rozstrzyga pierwsza.
            $this->postJson('/api/v1/admin/users/999999/unblock')
                ->assertStatus(403)
                ->assertJsonPath('error.code', 'forbidden');
        }

        $this->assertSame('blocked', $person->fresh()->status);
        $this->assertSame(0, $this->unblockAudits($person));
    }

    public function test_guest_gets_401(): void
    {
        $person = $this->blockedBound();

        $this->postJson("/api/v1/admin/users/{$person->id}/unblock")
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');

        $this->assertSame('blocked', $person->fresh()->status);
        $this->assertSame(0, $this->unblockAudits($person));
    }

    public function test_project_manager_cannot_unblock_a_super_admin(): void
    {
        $this->actingAsRole('project_manager');
        $superAdmin = User::factory()->role('super_admin')->create([
            'status' => 'blocked',
            'keycloak_sub' => (string) Str::uuid(),
        ]);

        $this->postJson("/api/v1/admin/users/{$superAdmin->id}/unblock")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden')
            ->assertJsonPath('error.message', 'Tylko Super Admin może zarządzać kontami Super Admina.');

        $this->assertSame('blocked', $superAdmin->fresh()->status);
        $this->assertSame(0, $this->unblockAudits($superAdmin));
    }

    /**
     * Nieznana osoba: to samo 404 co karta i blokada nieznanej osoby, z ciałem
     * i bez ciała — odpowiedź nie zależy od tego, co przyszło w żądaniu.
     */
    public function test_unknown_person_is_404(): void
    {
        $this->actingAsRole('super_admin');
        $missing = (int) User::query()->max('id') + 1000;

        $empty = $this->postJson("/api/v1/admin/users/{$missing}/unblock")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found')
            ->assertJsonPath('error.message', 'Nie znaleziono osoby.');

        $withBody = $this->postJson("/api/v1/admin/users/{$missing}/unblock", ['reason' => str_repeat('x', 5000)])
            ->assertStatus(404);

        $card = $this->getJson("/api/v1/admin/users/{$missing}")->assertStatus(404);

        $this->assertSame($empty->json(), $withBody->json());
        $this->assertSame($empty->json(), $card->json());
        $this->assertSame(0, AuditLogEntry::query()->where('action', 'user.unblocked')->count());
    }

    public function test_unblocking_an_account_that_is_not_blocked_is_403_and_writes_no_audit(): void
    {
        $this->actingAsRole('super_admin');

        $active = User::factory()->role('volunteer')->create(['status' => 'active', 'keycloak_sub' => (string) Str::uuid()]);
        $invited = User::factory()->role('volunteer')->invited()->create(['status' => 'invited']);

        foreach ([[$active, 'active'], [$invited, 'invited']] as [$person, $status]) {
            $this->postJson("/api/v1/admin/users/{$person->id}/unblock")
                ->assertStatus(403)
                ->assertJsonPath('error.code', 'account_not_blocked')
                ->assertJsonPath('error.message', 'To konto nie jest zablokowane.');

            $this->assertSame($status, $person->fresh()->status);
            $this->assertSame(0, $this->unblockAudits($person));
        }
    }

    public function test_anonymized_account_cannot_be_unblocked(): void
    {
        $this->actingAsRole('super_admin');

        $anonymized = User::factory()->role('volunteer')->create([
            'status' => 'deleted',
            'anonymized_at' => now(),
        ]);
        // Dane sprzed odmowy blokady konta zanonimizowanego: stan `blocked` po anonimizacji.
        $anonymizedThenBlocked = User::factory()->role('volunteer')->create([
            'status' => 'blocked',
            'anonymized_at' => now(),
        ]);

        foreach ([[$anonymized, 'deleted'], [$anonymizedThenBlocked, 'blocked']] as [$person, $status]) {
            $this->postJson("/api/v1/admin/users/{$person->id}/unblock")
                ->assertStatus(403)
                ->assertJsonPath('error.code', 'account_anonymized')
                ->assertJsonPath('error.message', 'Konta zanonimizowanego nie można odblokować.');

            $this->assertSame($status, $person->fresh()->status);
            $this->assertSame(0, $this->unblockAudits($person));
        }
    }

    public function test_blocking_an_anonymized_account_is_refused(): void
    {
        $this->actingAsRole('super_admin');

        $anonymized = User::factory()->role('volunteer')->create([
            'status' => 'deleted',
            'anonymized_at' => now(),
        ]);

        $this->postJson("/api/v1/admin/users/{$anonymized->id}/block", ['reason' => 'Próba.'])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'account_anonymized')
            ->assertJsonPath('error.message', 'Konta zanonimizowanego nie można zablokować.');

        $this->assertSame('deleted', $anonymized->fresh()->status);
        $this->assertSame(0, AuditLogEntry::query()
            ->where('action', 'user.blocked')
            ->where('subject_id', $anonymized->id)
            ->count());
    }

    /**
     * Odmowa ze względu na stan konta (kontrakt §1.1): ta sama na obu trasach,
     * w obu postaciach konta zanonimizowanego, bez żadnego skutku ubocznego.
     */
    public function test_an_anonymized_account_is_refused_with_403_on_block_and_unblock_and_nothing_is_written(): void
    {
        $this->actingAsRole('super_admin');

        $anonymized = User::factory()->role('volunteer')->create([
            'status' => 'deleted',
            'anonymized_at' => now(),
        ]);
        $anonymizedThenBlocked = User::factory()->role('volunteer')->create([
            'status' => 'blocked',
            'anonymized_at' => now(),
        ]);

        $routes = [
            ['block', ['reason' => 'Próba.'], 'Konta zanonimizowanego nie można zablokować.'],
            ['unblock', [], 'Konta zanonimizowanego nie można odblokować.'],
        ];

        foreach ([[$anonymized, 'deleted'], [$anonymizedThenBlocked, 'blocked']] as [$person, $status]) {
            foreach ($routes as [$route, $body, $message]) {
                $audits = AuditLogEntry::query()->count();
                $notifications = Notification::query()->count();
                $emails = EmailMessage::query()->count();

                $this->postJson("/api/v1/admin/users/{$person->id}/{$route}", $body)
                    ->assertStatus(403)
                    ->assertJsonPath('error.code', 'account_anonymized')
                    ->assertJsonPath('error.message', $message);

                $this->assertSame($status, $person->fresh()->status);
                $this->assertSame($audits, AuditLogEntry::query()->count());
                $this->assertSame($notifications, Notification::query()->count());
                $this->assertSame($emails, EmailMessage::query()->count());
            }
        }
    }
}
