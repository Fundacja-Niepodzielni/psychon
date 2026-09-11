<?php

namespace App\Services\Keycloak;

use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Shared back-channel logout READ PATH (contract §4.5a). SSO-only means
 * every business route resolves its user through the `keycloak` guard
 * (`KeycloakGuardResolver`), not only the `/sso/whoami` probe route — so
 * this check has to run in both places, identically, or a token whose
 * session Konta Niepodzielni already ended would keep working everywhere
 * except the one route that used to be the sole consumer of this store.
 */
final class KeycloakBackchannelInvalidation
{
    /** Point 6: "I cannot read the store" → refuse, force re-login. */
    public const CAUSE_CHECK_UNAVAILABLE = 'session_check_unavailable';

    /** Confirmed back-channel logout. */
    public const CAUSE_INVALIDATED = 'session_invalidated';

    public function __construct(
        private readonly InvalidationStore $markers,
        private readonly KeycloakSessionRegistry $sessions,
    ) {}

    /**
     * Returns `null` when the request may proceed, or the refusal cause
     * (one of the `CAUSE_*` constants) when the session behind `$sid` was
     * invalidated — or when the marker store could not be read at all
     * (fail-closed: "cannot tell" refuses, it never admits). A token with no
     * `sid` (e.g. `client_credentials`) never went through a session that
     * back-channel logout could end, so it always passes (`null`).
     */
    public function check(?string $sid, string $sub): ?string
    {
        if ($sid === null || $sid === '') {
            return null;
        }

        $verdict = $this->markers->verdict($sid);

        if ($verdict['state'] === InvalidationStore::READ_FAILURE) {
            // Point 7: a refusal caused by OUR OWN storage outage must not
            // delete the session-registry row — touch nothing else here.
            BackchannelLogoutAlarm::raise('read', $verdict['reason'], ['sid' => $sid]);

            return self::CAUSE_CHECK_UNAVAILABLE;
        }

        if ($verdict['state'] === InvalidationStore::READ_MARKED) {
            // Confirmed invalidation — safe to clean up the bookkeeping row,
            // wrapped defensively so an unrelated fault in this table never
            // turns a correct refusal into an uncaught 500.
            try {
                $this->sessions->destroy($sid, null);
            } catch (Throwable $e) {
                Log::warning('keycloak.backchannel_logout.session_cleanup_failed', ['message' => $e->getMessage()]);
            }

            return self::CAUSE_INVALIDATED;
        }

        // READ_ABSENT with a HEALTHY store: the positive control half of
        // point 6 — a healthy, empty marker store must still admit
        // everybody. Bookkeeping only, wrapped for the same reason as above.
        try {
            $this->sessions->touch($sid, $sub);
        } catch (Throwable $e) {
            Log::warning('keycloak.backchannel_logout.session_touch_failed', ['message' => $e->getMessage()]);
        }

        return null;
    }
}
