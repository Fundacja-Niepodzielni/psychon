<?php

namespace Tests\Feature\Sso;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Tests\Support\Sso\KeycloakTokenFactory;
use Tests\TestCase;

/**
 * `POST /oidc/backchannel-logout` — the write path of OIDC Back-Channel
 * Logout 1.0. Every negative leg here breaks Postgres for real (a renamed
 * table, a trigger that silently discards an insert) so the failure the
 * handler reacts to is a genuine one, never a flag it reads.
 *
 * `RefreshDatabase` gives this class its own, isolated database per parallel
 * worker, so the DDL these tests run against `keycloak_logout_markers` never
 * touches a neighbour's table.
 */
class BackchannelLogoutTest extends TestCase
{
    use RefreshDatabase;

    private const ROUTE = '/oidc/backchannel-logout';

    public function test_write_is_confirmed_by_reading_it_back(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sid = 'sid-read-back-'.uniqid();
        $token = $realm->mintLogoutToken(['sid' => $sid]);

        $this->postJson(self::ROUTE, ['logout_token' => $token])
            ->assertStatus(200)
            ->assertJsonPath('decision', 'WRITTEN');

        $this->assertDatabaseHas('keycloak_logout_markers', ['sid' => $sid]);
    }

    /**
     * A write call that does not throw is not proof the row exists: a
     * `BEFORE INSERT` trigger that returns `NULL` discards the insert
     * silently, the same shape as a read-only replica accepting a
     * statement it never durably applies. Genuine Postgres behaviour, set
     * up with real DDL, not a flag the handler reads.
     */
    public function test_a_write_that_does_not_read_back_is_not_written(): void
    {
        $sid = 'sid-swallowed-'.uniqid();
        $this->swallowNextInsertInto('keycloak_logout_markers', $sid);

        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $token = $realm->mintLogoutToken(['sid' => $sid]);

        $response = $this->postJson(self::ROUTE, ['logout_token' => $token]);

        $response->assertStatus(503);
        $this->assertDatabaseMissing('keycloak_logout_markers', ['sid' => $sid]);
    }

    public function test_a_logout_token_without_sid_is_skipped_not_failed(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        // No 'sid' override: a sub-only logout token, explicitly permitted
        // by OIDC BCL 1.0 — must not be treated as a write failure.
        $token = $realm->mintLogoutToken();

        $this->postJson(self::ROUTE, ['logout_token' => $token])
            ->assertStatus(200)
            ->assertJsonPath('decision', 'SKIPPED');
    }

    public function test_failed_write_answers_503_with_no_store_on_that_branch(): void
    {
        DB::statement('ALTER TABLE keycloak_logout_markers RENAME TO keycloak_logout_markers_outage');

        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $token = $realm->mintLogoutToken(['sid' => 'sid-outage-'.uniqid()]);

        $response = $this->postJson(self::ROUTE, ['logout_token' => $token]);

        $response->assertStatus(503);
        // Symfony appends `private` by default when no explicit `public`
        // directive is set; the literal `no-store` the contract requires is
        // what this asserts, not byte-for-byte equality with the whole header.
        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
    }

    /**
     * The companion to the previous test: proves the 503 above is the
     * failure branch specifically, by showing a healthy write answers 200 —
     * a handler that always answered 503 (or that only set the header on
     * one hardcoded status) would pass a test that checked either branch
     * alone.
     */
    public function test_a_healthy_write_answers_200_not_503(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $token = $realm->mintLogoutToken(['sid' => 'sid-healthy-'.uniqid()]);

        $this->postJson(self::ROUTE, ['logout_token' => $token])
            ->assertStatus(200);
    }

    public function test_alarm_is_raised_once_per_window_with_the_genuine_cause(): void
    {
        config(['keycloak.alarm_throttle_seconds' => 1]);

        $critical = [];
        Log::listen(function (MessageLogged $event) use (&$critical): void {
            if ($event->level === 'critical') {
                $critical[] = $event;
            }
        });

        DB::statement('ALTER TABLE keycloak_logout_markers RENAME TO keycloak_logout_markers_outage_alarm');

        $realm = (new KeycloakTokenFactory)->installAsRealm();

        $this->postJson(self::ROUTE, ['logout_token' => $realm->mintLogoutToken(['sid' => 'sid-a-'.uniqid()])])
            ->assertStatus(503);

        $this->assertCount(1, $critical, 'First failure in the window must raise exactly one alarm.');
        $this->assertSame('keycloak.backchannel_logout.invalidation_store_unavailable', $critical[0]->message);
        $this->assertSame('write', $critical[0]->context['path']);
        $this->assertIsString($critical[0]->context['reason']);
        $this->assertStringContainsString(
            'keycloak_logout_markers',
            $critical[0]->context['reason'],
            'The alarm must carry the genuine cause, not merely note that something failed.',
        );

        // Second failure, still inside the 1s window: suppressed.
        $this->postJson(self::ROUTE, ['logout_token' => $realm->mintLogoutToken(['sid' => 'sid-b-'.uniqid()])])
            ->assertStatus(503);

        $this->assertCount(1, $critical, 'A second failure inside the same window must not raise a second alarm.');

        sleep(2); // past the 1s window

        $this->postJson(self::ROUTE, ['logout_token' => $realm->mintLogoutToken(['sid' => 'sid-c-'.uniqid()])])
            ->assertStatus(503);

        $this->assertCount(2, $critical, 'Once the window passes, the next failure must re-arm the alarm.');
    }

    /**
     * Point 5, "pasy i szelki": local session bookkeeping is destroyed
     * before the response is decided, regardless of what the marker write
     * did — including the FAILED path, where it would be easiest to skip
     * this step by accident (e.g. an early return before cleanup runs).
     */
    public function test_local_session_is_destroyed_even_when_the_marker_write_fails(): void
    {
        $sid = 'sid-destroy-on-failure-'.uniqid();
        DB::table('keycloak_sessions')->insert(['sid' => $sid, 'sub' => 'sub-destroy-test', 'created_at' => now()]);

        // Same "swallowed insert" cause as the read-back test above, chosen
        // deliberately over a renamed table here: a renamed-table failure is
        // a genuine SQLSTATE error, and Postgres holds the whole surrounding
        // transaction aborted after one, which would make session cleanup's
        // own query fail too — for a reason that exists only because this
        // suite's transaction-per-test isolation is not how a real request
        // runs. The trigger fails the write without ever raising an error,
        // so session cleanup executes on a healthy connection, exactly as
        // it would in production.
        $this->swallowNextInsertInto('keycloak_logout_markers', $sid);

        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $token = $realm->mintLogoutToken(['sid' => $sid]);

        $this->postJson(self::ROUTE, ['logout_token' => $token])->assertStatus(503);

        $this->assertDatabaseMissing('keycloak_sessions', ['sid' => $sid]);
    }

    /**
     * Installs a `BEFORE INSERT` trigger that silently discards the one row
     * matching `$sid` — a write that reports success without ever landing,
     * the same shape as a read-only replica accepting a statement it never
     * durably applies. Real DDL against the running database, not a flag.
     */
    private function swallowNextInsertInto(string $table, string $sid): void
    {
        DB::unprepared(<<<SQL
            CREATE OR REPLACE FUNCTION swallow_insert_{$table}() RETURNS trigger AS \$body\$
            BEGIN
                RETURN NULL;
            END;
            \$body\$ LANGUAGE plpgsql;

            CREATE TRIGGER swallow_insert_{$table}_trigger
            BEFORE INSERT ON {$table}
            FOR EACH ROW WHEN (NEW.sid = '{$sid}')
            EXECUTE FUNCTION swallow_insert_{$table}();
        SQL);
    }
}
