<?php

namespace Tests\Feature\H01;

use App\Models\AuditLogEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Tests\Concerns\ActsAsRole;
use Tests\Support\Sso\KeycloakTokenFactory;
use Tests\TestCase;

/**
 * Rewrite of the acceptance-rejected witness for "own account view reads
 * `role` from the token, not from `users.role`" (`TokenRoles::effectiveRoleFor()`,
 * commit 3519a57). The rejected version failed for two independent reasons
 * (measured on this same fixed code, both were still red):
 *
 *   1. Several `withHeader(...)->getJson(...)` calls shared ONE test method.
 *      `Auth::viaRequest`'s `RequestGuard` caches its resolved user for the
 *      guard instance's whole lifetime (see `KeycloakGuardTest`'s own note on
 *      this), so the second and third calls silently kept the FIRST call's
 *      resolved user — with an EMPTY role list, since the guard's per-instance
 *      cache never re-attaches a new `keycloak_principal`. "The gate must
 *      refuse" then passed because the remembered user carried no roles at
 *      all, never because R2 (token-over-column) actually ran.
 *   2. One assertion demanded the literal OPPOSITE of the fix: that `role`
 *      on a SELF view stayed `users.role`. That assertion can never turn
 *      green after 3519a57 — it was asserting the bug.
 *
 *   Every test below either fires exactly ONE bearer request, or clears the
 *   guard explicitly between requests and PROVES the clearing worked (see
 *   {@see test_clearing_the_guard_between_requests_yields_the_second_tokens_own_role()}).
 *
 *   Mutation check (revert `TokenRoles::effectiveRoleFor()` to `return
 *   $user->role;` unconditionally — the pre-3519a57 shape): every test in
 *   this class that asserts the TOKEN's role wins turns red. Measured
 *   2026-09-17: 5 failures on the reverted code, 0 on HEAD.
 */
class SelfViewRoleFromTokenTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    private const ME_ROUTE = '/api/v1/me';

    /**
     * Leg 1 of the disagreement guarantee applied to the self view: the
     * local column is LOWER privilege than the token. `users.role` =
     * volunteer, token carries `admin-fundacja` (→ `super_admin`) — the
     * reported `role` must be the token's, not the stale column.
     */
    public function test_self_view_role_wins_when_the_column_is_lower_privilege(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        User::factory()->role('volunteer')->create(['keycloak_sub' => $sub]);
        $token = $realm->mint(['sub' => $sub, 'realm_access' => ['roles' => ['admin-fundacja']]]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::ME_ROUTE)
            ->assertOk()
            ->assertJsonPath('data.role', 'super_admin');
    }

    /**
     * Leg 2, the mirror: the local column is HIGHER privilege than the
     * token. `users.role` = super_admin, token carries only `wolontariusz`
     * (→ `volunteer`) — the reported `role` must be the token's, the LOWER
     * one, not the higher-privilege column.
     */
    public function test_self_view_role_wins_when_the_column_is_higher_privilege(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        User::factory()->role('super_admin')->create(['keycloak_sub' => $sub]);
        $token = $realm->mint(['sub' => $sub, 'realm_access' => ['roles' => ['wolontariusz']]]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::ME_ROUTE)
            ->assertOk()
            ->assertJsonPath('data.role', 'volunteer');
    }

    /**
     * D3: a token that carries none of the whitelisted realm roles now
     * reports an EMPTY `role` on the self view — not the old default
     * string, and not the (higher-privilege) local column either. This
     * pins the current, deliberately changed, response shape.
     */
    public function test_self_view_role_is_empty_when_the_token_carries_no_whitelisted_role(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        User::factory()->role('volunteer')->create(['keycloak_sub' => $sub]);
        $token = $realm->mint(['sub' => $sub, 'realm_access' => ['roles' => ['nieznana-rola-ekosystemu']]]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::ME_ROUTE)
            ->assertOk()
            ->assertJsonPath('data.role', null);
    }

    /**
     * The declared boundary of the fix, not an oversight: a view of SOMEONE
     * ELSE's account (H04 access extension, `UserResource` on the target,
     * not the caller) has no other person's token on this request to derive
     * from and must keep reporting the column — even though the ACTING
     * admin's own token is real and carries a role of its own. The target's
     * column is deliberately set HIGHER than what the admin's token would
     * ever grant, so a leak from either side would show up as a mismatch.
     */
    public function test_someone_elses_account_view_still_reports_the_column(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $adminSub = (string) Str::uuid();
        $admin = User::factory()->role('project_manager')->create(['keycloak_sub' => $adminSub]);
        $adminToken = $realm->mint(['sub' => $adminSub, 'realm_access' => ['roles' => ['koordynator']]]);

        $target = User::factory()->create(['role' => 'super_admin', 'access_expires_at' => null]);

        $response = $this->withHeader('Authorization', 'Bearer '.$adminToken)
            ->postJson("/api/v1/admin/users/{$target->id}/extend-access", ['months' => 1])
            ->assertOk();

        $this->assertSame(
            'super_admin',
            $response->json('data.role'),
            'Widok cudzego konta musi nadal pokazywać kolumnę, nie token wywołującego.',
        );
        $this->assertNotSame($admin->role, $response->json('data.role'));
    }

    /**
     * Proof that "one bearer call per test" is not the only safe shape:
     * clearing the guard between two REAL, DIFFERENT tokens inside one test
     * (`$this->app['auth']->forgetGuards()`, the same call `LessonResumeTest`
     * already uses for "log out and come back") makes the second request
     * see the second token's OWN role — never empty, never the first
     * request's leftover. This is the exact failure mode the rejected
     * witness had (empty role remembered from call 1); this test measures
     * that it is fixed here.
     */
    public function test_clearing_the_guard_between_requests_yields_the_second_tokens_own_role(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();

        $firstSub = (string) Str::uuid();
        User::factory()->role('volunteer')->create(['keycloak_sub' => $firstSub]);
        $firstToken = $realm->mint(['sub' => $firstSub, 'realm_access' => ['roles' => ['wolontariusz']]]);

        $firstRole = $this->withHeader('Authorization', 'Bearer '.$firstToken)
            ->getJson(self::ME_ROUTE)
            ->assertOk()
            ->json('data.role');
        $this->assertSame('volunteer', $firstRole);

        $this->app['auth']->forgetGuards();

        $secondSub = (string) Str::uuid();
        User::factory()->role('volunteer')->create(['keycloak_sub' => $secondSub]);
        $secondToken = $realm->mint(['sub' => $secondSub, 'realm_access' => ['roles' => ['admin-fundacja']]]);

        $secondRole = $this->withHeader('Authorization', 'Bearer '.$secondToken)
            ->getJson(self::ME_ROUTE)
            ->assertOk()
            ->json('data.role');

        $this->assertNotNull($secondRole, 'Po wyczyszczeniu strażnika druga rola nie może być pusta.');
        $this->assertNotSame($firstRole, $secondRole, 'Druga odpowiedź nie może być rolą pierwszego wywołania.');
        $this->assertSame('super_admin', $secondRole);
    }

    /**
     * D1 measured, not fixed here (out of the TESTY role's scope — the
     * guard denies edits to `backend/app/Services/Auth/TokenRoles.php`,
     * `czy-wolno.sh TESTY backend/app/Services/Auth/TokenRoles.php` →
     * ODMOWA, measured 2026-09-17). The mismatch warning still lands only
     * in the application log, never in the administration audit register:
     * forcing the exact disagreement this class's other tests use produces
     * ZERO rows in `audit_log`, while `Log::warning('auth.role_column_mismatch', …)`
     * fires — account id only, no token value, no personal data.
     */
    public function test_a_forced_mismatch_never_reaches_the_admin_audit_register(): void
    {
        Log::spy();

        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        $user = User::factory()->role('volunteer')->create(['keycloak_sub' => $sub]);
        $token = $realm->mint(['sub' => $sub, 'realm_access' => ['roles' => ['admin-fundacja']]]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::ME_ROUTE)
            ->assertOk()
            ->assertJsonPath('data.role', 'super_admin');

        $this->assertSame(
            0,
            AuditLogEntry::where('action', 'auth.role_column_mismatch')->count(),
            'Rozjazd roli nie trafia dziś do rejestru zdarzeń administracji (D1, niedomknięte).',
        );
        $this->assertSame(0, AuditLogEntry::count(), 'Żaden wpis w ogóle nie powinien powstać z tego powodu.');

        Log::shouldHaveReceived('warning')
            ->once()
            ->withArgs(fn (string $message, array $context): bool => $message === 'auth.role_column_mismatch'
                && $context === ['user_id' => $user->id]);
    }
}
