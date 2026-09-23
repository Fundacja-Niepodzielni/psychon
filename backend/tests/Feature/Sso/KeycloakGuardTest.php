<?php

namespace Tests\Feature\Sso;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Support\Sso\KeycloakTokenFactory;
use Tests\TestCase;

/**
 * SSO only: the named `keycloak` guard behind `auth:keycloak` on every
 * business route. Resolves a LOCAL user by `keycloak_sub`, by identity
 * only (never by e-mail). Authorisation is the OPPOSITE of what this class
 * used to assert: R2 (sprint-2 §1) reads roles from the validated access
 * token exclusively — `users.role` never wins, whichever way the two
 * disagree (the disagreement guarantee, proved below).
 */
class KeycloakGuardTest extends TestCase
{
    use RefreshDatabase;

    private const ME_ROUTE = '/api/v1/me';

    private const BUSINESS_ROUTE = '/api/v1/admin/report';

    /**
     * This route was picked as the "business route" fixture precisely
     * because it needed nothing beyond an authenticated, authorised
     * request — no seeded records, no world beyond the user under test.
     * That stopped being true once the report started reading the active
     * edition's thresholds before it can answer: any legitimately
     * authorised request now needs an active edition to exist, or it
     * fails for a reason that has nothing to do with what this class
     * proves (identity and role resolution through the guard). Seeding
     * here restores the world this fixture always assumed, without
     * touching what the assertions below actually check.
     */
    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    /**
     * Split into two single-resolution tests on purpose (see the note on
     * {@see test_a_backchannel_logged_out_session_gets_401_on_a_business_route()}):
     * `Auth::viaRequest`'s `RequestGuard` caches its resolved user — and,
     * with it, whether `keycloak_principal` ever got attached — for the
     * guard instance's lifetime, which persists across several simulated
     * requests inside ONE test. A single test calling `/me` then the
     * business route would silently reuse the first call's cached
     * resolution for the second, never re-running the resolver and never
     * re-attaching the principal the second request needs.
     */
    public function test_a_bound_active_user_gets_200_on_me(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        $user = User::factory()->role('super_admin')->create(['keycloak_sub' => $sub]);
        $token = $realm->mint(['sub' => $sub]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::ME_ROUTE)
            ->assertStatus(200)
            ->assertJsonPath('data.id', $user->id);
    }

    public function test_a_bound_active_user_with_the_whitelisted_token_role_gets_200_on_a_business_route(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        User::factory()->role('super_admin')->create(['keycloak_sub' => $sub]);
        // R2: the business route is authorised by the TOKEN's role, not
        // `users.role` — this bound user's token must actually carry the
        // whitelisted realm role for the 200 to mean anything.
        $token = $realm->mint(['sub' => $sub, 'realm_access' => ['roles' => ['admin-fundacja']]]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::BUSINESS_ROUTE)
            ->assertStatus(200);
    }

    public function test_an_unbound_sub_gets_401(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $token = $realm->mint(['sub' => (string) Str::uuid()]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::ME_ROUTE)
            ->assertStatus(401);
    }

    /**
     * Mutation check: temporarily remove the blocked check in
     * `KeycloakGuardResolver`, confirm this test fails, then restore it.
     * Measured 2026-09-11: failing mutant returned 200 (assertStatus(401)
     * failed), fixed code returns 401.
     */
    public function test_a_blocked_user_gets_401(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        User::factory()->create(['keycloak_sub' => $sub, 'status' => 'blocked']);
        $token = $realm->mint(['sub' => $sub]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::ME_ROUTE)
            ->assertStatus(401);
    }

    public function test_a_deleted_user_gets_401(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        User::factory()->create(['keycloak_sub' => $sub, 'status' => 'deleted']);
        $token = $realm->mint(['sub' => $sub]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::ME_ROUTE)
            ->assertStatus(401);
    }

    /**
     * Mutation check: temporarily remove the `anonymized_at` check, confirm
     * this test fails, then restore it. Measured 2026-09-11: failing mutant
     * returned 200, fixed code returns 401.
     */
    public function test_an_anonymised_user_gets_401(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        User::factory()->create(['keycloak_sub' => $sub, 'anonymized_at' => now()]);
        $token = $realm->mint(['sub' => $sub]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::ME_ROUTE)
            ->assertStatus(401);
    }

    /**
     * The disagreement guarantee (R2, sprint-2 §1, starred criterion): the
     * ACCESS TOKEN wins over a conflicting `users.role`, in both
     * directions.
     *
     * `users.role` = volunteer (a participant), token carries the realm
     * role mapped to `super_admin` (`admin-fundacja`, see
     * `config('keycloak.roles')`) → the admin route answers 200, because
     * the token — not the stale/conflicting local row — is what
     * `EnsureRole` reads.
     *
     * Mutation check: make `EnsureRole` read `$user->role` again (its old
     * shape, before R2) instead of `TokenRoles`. This test fails —
     * `assertStatus(200)` receives 403 — because the local row still says
     * `volunteer`. Restore `EnsureRole` afterwards. Measured 2026-09-11.
     */
    public function test_the_token_wins_when_the_local_role_is_lower_privilege(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        User::factory()->role('volunteer')->create(['keycloak_sub' => $sub]);
        $token = $realm->mint(['sub' => $sub, 'realm_access' => ['roles' => ['admin-fundacja']]]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::BUSINESS_ROUTE)
            ->assertStatus(200);
    }

    /**
     * K6 · `users.role` = super_admin, but the token carries NO
     * roles at all (`realm_access.roles = []` — never bound through
     * `actingAs`, a REAL bearer token minted by `KeycloakTokenFactory`) →
     * the admin route refuses. This is the witness the register asks for:
     * a route that depends on role denies when the token carries none,
     * even though `users.role` says admin. Paired with the leg above
     * (real token WITH the role → 200), it is what "green suite" alone
     * cannot stand in for — most of this suite authenticates through the
     * `actingAs` fallback (`Tests\Unit\Auth\TokenRolesFallbackTest`),
     * never through a token this route actually validates.
     */
    public function test_the_token_wins_when_it_carries_no_roles_at_all(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        User::factory()->role('super_admin')->create(['keycloak_sub' => $sub]);
        $token = $realm->mint(['sub' => $sub, 'realm_access' => ['roles' => []]]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::BUSINESS_ROUTE)
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }

    /**
     * The mirror leg of the same disagreement guarantee: `users.role` =
     * super_admin (the local row itself would pass the old, pre-R2 gate),
     * but the token carries none of the whitelisted realm roles (only the
     * realm role mapped to `volunteer`, i.e. a participant) → the admin
     * route answers 403. A high-privilege local row buys nothing once
     * authorisation reads the token.
     */
    public function test_the_token_wins_when_the_local_role_is_higher_privilege(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        User::factory()->role('super_admin')->create(['keycloak_sub' => $sub]);
        $token = $realm->mint(['sub' => $sub, 'realm_access' => ['roles' => ['wolontariusz']]]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::BUSINESS_ROUTE)
            ->assertStatus(403);
    }

    /**
     * The composite marker `wymaga-2fa` and an unknown realm role
     * (`nieznana-rola-ekosystemu`, never listed in `config('keycloak.roles')`)
     * grant nothing — "all roles from the token" is exactly the mistake R2
     * warns against.
     *
     * Split into two single-resolution tests (see the note on
     * {@see test_a_bound_active_user_with_the_whitelisted_token_role_gets_200_on_a_business_route()}):
     * one bearer call per test, never two, so the guard's per-instance user
     * cache never masks a second request's real (non-)resolution.
     */
    public function test_the_2fa_marker_and_an_unknown_realm_role_grant_no_roles_on_me(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        User::factory()->create(['keycloak_sub' => $sub]);
        $token = $realm->mint(['sub' => $sub, 'realm_access' => ['roles' => ['wymaga-2fa', 'nieznana-rola-ekosystemu']]]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::ME_ROUTE)
            ->assertStatus(200)
            ->assertJsonPath('data.roles', []);
    }

    public function test_the_2fa_marker_and_an_unknown_realm_role_grant_no_access_to_a_business_route(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        User::factory()->create(['keycloak_sub' => $sub]);
        $token = $realm->mint(['sub' => $sub, 'realm_access' => ['roles' => ['wymaga-2fa', 'nieznana-rola-ekosystemu']]]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::BUSINESS_ROUTE)
            ->assertStatus(403);
    }

    /**
     * An empty whitelisted role set is a valid state (R2 point 2): the
     * bearer authenticates fine (`/me` 200) and simply carries no roles —
     * never a 401, never an error — while a role-protected resource still
     * answers 403.
     *
     * Split into two single-resolution tests for the same reason as above.
     */
    public function test_an_empty_whitelisted_role_set_gets_200_on_me_with_no_roles(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        User::factory()->create(['keycloak_sub' => $sub]);
        $token = $realm->mint(['sub' => $sub, 'realm_access' => ['roles' => []]]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::ME_ROUTE)
            ->assertStatus(200)
            ->assertJsonPath('data.roles', []);
    }

    public function test_an_empty_whitelisted_role_set_gets_403_not_401_on_a_business_route(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        User::factory()->create(['keycloak_sub' => $sub]);
        $token = $realm->mint(['sub' => $sub, 'realm_access' => ['roles' => []]]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::BUSINESS_ROUTE)
            ->assertStatus(403);
    }

    public function test_last_login_at_is_throttled_to_once_per_24h(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        $recent = now()->subHours(2);
        $user = User::factory()->create(['keycloak_sub' => $sub, 'last_login_at' => $recent]);
        $token = $realm->mint(['sub' => $sub]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::ME_ROUTE)
            ->assertStatus(200);

        $user->refresh();
        $this->assertSame(
            $recent->format('Y-m-d H:i:s'),
            $user->last_login_at->format('Y-m-d H:i:s'),
            'last_login_at powinno zostać niezmienione w oknie 24h.',
        );
    }

    public function test_last_login_at_updates_after_24h(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        $stale = now()->subHours(25);
        $user = User::factory()->create(['keycloak_sub' => $sub, 'last_login_at' => $stale]);
        $token = $realm->mint(['sub' => $sub]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::ME_ROUTE)
            ->assertStatus(200);

        $user->refresh();
        $this->assertTrue($user->last_login_at->gt($stale), 'last_login_at powinno zostać odświeżone po 24h.');
    }

    /**
     * SSO only: EVERY business route resolves its user through this guard,
     * not only `/sso/whoami` — so a back-channel logout must end a session
     * there too. Bind a user, record a real invalidation for the token's
     * `sid` the same way `BackchannelLogoutReadPathTest` does (through the
     * actual `/oidc/backchannel-logout` endpoint, never a stubbed flag),
     * then confirm `/api/v1/me` refuses the now-invalidated token.
     *
     * The marker is written BEFORE `/me` is ever called (rather than
     * proving a 200 first, then a 401 after logout, on the SAME token in
     * the SAME test): `Auth::viaRequest` guards cache their resolved user
     * for the guard instance's lifetime (`Illuminate\Auth\RequestGuard`,
     * `GuardHelpers::$user`), which — ONLY inside a single test process
     * making several simulated requests, never across real, separate HTTP
     * requests in production — would let a second call short-circuit
     * straight to the cached user without re-running the resolver at all.
     * One resolution per test keeps this test honest about what it proves.
     *
     * Mutation check: remove `KeycloakBackchannelInvalidation::check()`'s
     * call inside `KeycloakGuardResolver::resolve()`, confirm this test
     * fails (200 instead of 401), then restore it. Measured 2026-09-11.
     */
    public function test_a_backchannel_logged_out_session_gets_401_on_a_business_route(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        $sid = 'sid-guard-backchannel-'.Str::random(8);
        User::factory()->create(['keycloak_sub' => $sub]);
        $token = $realm->mint(['sub' => $sub, 'sid' => $sid]);

        $logoutToken = $realm->mintLogoutToken(['sid' => $sid]);
        $this->postJson('/oidc/backchannel-logout', ['logout_token' => $logoutToken])
            ->assertStatus(200)
            ->assertJsonPath('decision', 'WRITTEN');

        // The guard refuses it too, exactly like the `auth.keycloak`
        // middleware already did on `/sso/whoami`. The guard resolves to
        // `null` rather than throwing `ApiException` (same shape as
        // "blocked" / "unbound" above), so the envelope here is the generic
        // `unauthenticated` one, not `invalid_token`.
        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::ME_ROUTE)
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
    }
}
