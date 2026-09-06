<?php

namespace Tests\Feature\Sso;

use App\Services\Keycloak\TokenValidator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\Sso\KeycloakTokenFactory;
use Tests\TestCase;

/**
 * The read path (`AuthenticateKeycloakToken`, `auth.keycloak`), exercised
 * through `GET /api/v1/sso/whoami` — the same route the hermetic
 * token-validation suite uses. Every negative leg breaks the invalidation
 * store's own table for real; nothing here is a flag the middleware reads.
 */
class BackchannelLogoutReadPathTest extends TestCase
{
    use RefreshDatabase;

    private const ROUTE = '/api/v1/sso/whoami';

    /**
     * Positive control for point 6: a healthy, EMPTY marker store must
     * still admit a valid token — without this leg a fail-safe read path
     * could accidentally deny everyone and nobody would notice in a suite
     * that only tests the negative half.
     */
    public function test_a_healthy_empty_store_still_admits_the_token(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $token = $realm->mint(['sid' => 'sid-healthy-read-'.uniqid()]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::ROUTE)
            ->assertStatus(200);
    }

    /**
     * Negative half of point 6: a store that cannot be read must refuse,
     * never silently admit — "cannot tell" means "not invalidated → deny".
     */
    public function test_an_unreadable_store_refuses_an_otherwise_valid_token(): void
    {
        DB::statement('ALTER TABLE keycloak_logout_markers RENAME TO keycloak_logout_markers_read_outage');

        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $token = $realm->mint(['sid' => 'sid-read-outage-'.uniqid()]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(self::ROUTE)
            ->assertStatus(401)
            ->assertJsonPath('error.reason.cause', 'session_check_unavailable');
    }

    // Point 7 (a storage-outage refusal must not evict the session record,
    // and the marker decides once the store heals) lives in its own class,
    // `BackchannelLogoutOutageDoesNotEvictSessionTest` — see that class's
    // own comment for why it cannot share this one's `RefreshDatabase`.

    /**
     * The bearer boundary (identity contract's own note: a bearer token
     * bypasses the IdP session by design). Same token, same `sid`, on
     * either side of the one place that closes that gap: through
     * `auth.keycloak` it dies once a real logout marks its `sid`; the
     * validator alone, given the identical string, still accepts it —
     * because the raw JWT's signature and claims never changed. Both
     * claim lists are asserted exactly, never only a negation.
     */
    public function test_the_bearer_boundary_middleware_dies_validator_alone_accepts(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sid = 'sid-boundary-'.uniqid();
        $sub = 'sub-boundary-holder';
        $accessToken = $realm->mint(['sid' => $sid, 'sub' => $sub, 'realm_access' => ['roles' => ['kandydat']]]);

        $logoutToken = $realm->mintLogoutToken(['sid' => $sid]);
        $this->postJson('/oidc/backchannel-logout', ['logout_token' => $logoutToken])
            ->assertStatus(200)
            ->assertJsonPath('decision', 'WRITTEN');

        // Dies: the one route this middleware guards refuses the now-marked sid.
        $this->withHeader('Authorization', 'Bearer '.$accessToken)
            ->getJson(self::ROUTE)
            ->assertStatus(401)
            ->assertJsonPath('error.reason.cause', 'session_invalidated');

        // Does not die: the validator alone, no middleware, no marker lookup,
        // on the exact same token string — the raw JWT is still what it was.
        $principal = app(TokenValidator::class)->validate($accessToken);

        $this->assertSame($sub, $principal->sub);
        $this->assertSame($sid, $principal->sid);
        $this->assertSame(['kandydat'], $principal->roles);
    }
}
