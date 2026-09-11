<?php

namespace Tests\Feature\Sso;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Support\Sso\KeycloakTokenFactory;
use Tests\TestCase;

/**
 * SSO only: the named `keycloak` guard behind `auth:keycloak` on every
 * business route. Resolves a LOCAL user by `keycloak_sub`, never touches
 * `realm_access.roles` for authorisation — `users.role` stays the only
 * source (the disagreement guarantee).
 */
class KeycloakGuardTest extends TestCase
{
    use RefreshDatabase;

    private const ME_ROUTE = '/api/v1/me';

    private const BUSINESS_ROUTE = '/api/v1/admin/report';

    public function test_a_bound_active_user_gets_200_on_me_and_a_business_route(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        $user = User::factory()->role('super_admin')->create(['keycloak_sub' => $sub]);
        $token = $realm->mint(['sub' => $sub]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::ME_ROUTE)
            ->assertStatus(200)
            ->assertJsonPath('data.id', $user->id);

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
     * Local `users.role` stays the only source of business roles: a
     * keycloak-bound participant gets 403 on an admin route even though the
     * token itself carries an admin realm role.
     */
    public function test_local_role_wins_over_the_tokens_realm_role(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        User::factory()->role('volunteer')->create(['keycloak_sub' => $sub]);
        $token = $realm->mint(['sub' => $sub, 'realm_access' => ['roles' => ['super_admin']]]);

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
