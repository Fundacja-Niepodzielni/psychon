<?php

namespace Tests\Feature\Sso;

use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Group;
use Tests\Support\Sso\KeycloakTokenFactory;
use Tests\TestCase;

/**
 * Point 7: a refusal caused by OUR OWN storage outage must not evict the
 * session-registry row, and once the store heals, the marker — not
 * whatever happened during the outage — decides the outcome.
 *
 * Deliberately WITHOUT `RefreshDatabase`. This leg needs a genuinely thrown
 * database error on the read path, and needs the connection to still be
 * usable for a live follow-up request afterwards (the recovery half).
 * `RefreshDatabase` wraps an entire test in one transaction, and Postgres
 * holds that whole transaction aborted after any statement inside it
 * errors — even one the application already caught — so a wrongly-added
 * cleanup call placed right after the caught error would silently no-op
 * instead of actually running, masking exactly the regression this test
 * exists to catch. A real, per-request connection never has this problem
 * (each statement is its own implicit transaction), so this class manages
 * its own setup and teardown instead of borrowing the trait, to match that.
 */
#[Group('wspolna-baza')]
class BackchannelLogoutOutageDoesNotEvictSessionTest extends TestCase
{
    private const ROUTE = '/api/v1/sso/whoami';

    public function test_outage_refusal_preserves_the_session_and_the_marker_decides_after_recovery(): void
    {
        $sid = 'sid-outage-preserve-'.uniqid();

        DB::table('keycloak_sessions')->insert(['sid' => $sid, 'sub' => 'sub-outage-preserve', 'created_at' => now()]);

        try {
            DB::statement('ALTER TABLE keycloak_logout_markers RENAME TO keycloak_logout_markers_read_outage_own_tx');

            $realm = (new KeycloakTokenFactory)->installAsRealm();
            $token = $realm->mint(['sid' => $sid, 'sub' => 'sub-outage-preserve']);

            $this->withHeader('Authorization', 'Bearer '.$token)
                ->getJson(self::ROUTE)
                ->assertStatus(401)
                ->assertJsonPath('error.reason.cause', 'session_check_unavailable');

            // A refusal caused by our own storage outage must not delete the session record.
            $this->assertDatabaseHas('keycloak_sessions', ['sid' => $sid]);

            DB::statement('ALTER TABLE keycloak_logout_markers_read_outage_own_tx RENAME TO keycloak_logout_markers');

            // No marker was ever written for this sid — the healed store
            // finds it ABSENT, and the marker (not the outage, not any
            // cleanup that might have run during it) decides: admitted.
            $this->withHeader('Authorization', 'Bearer '.$token)
                ->getJson(self::ROUTE)
                ->assertStatus(200);
        } finally {
            // No trait cleans this up automatically — undo both real,
            // committed effects this test made, regardless of outcome.
            DB::statement('ALTER TABLE IF EXISTS keycloak_logout_markers_read_outage_own_tx RENAME TO keycloak_logout_markers');
            DB::table('keycloak_sessions')->where('sid', $sid)->delete();
        }
    }
}
