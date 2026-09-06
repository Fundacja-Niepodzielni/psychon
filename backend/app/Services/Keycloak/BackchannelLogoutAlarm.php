<?php

namespace App\Services\Keycloak;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * The one remedy that does not depend on the identity provider's own
 * behaviour. Measured on Keycloak 26.7.0 (contract §4.5): after a `503` the
 * IdP delivers the back-channel logout call once, in a 90 s window, and
 * neither retries nor logs anything — so the HTTP status code we answer
 * with is cosmetic, and this alarm is the only signal that reaches anyone.
 *
 * Throttled per path (`write` / `read`), because the read path
 * (`AuthenticateKeycloakToken`) re-checks the marker store on every
 * request while it is down — without throttling, a single outage would
 * alarm once per request instead of once per window.
 */
final class BackchannelLogoutAlarm
{
    /**
     * @param  array<string,mixed>  $context
     */
    public static function raise(string $path, ?string $reason, array $context = []): void
    {
        $seconds = (int) config('keycloak.alarm_throttle_seconds', 60);
        $key = 'keycloak:backchannel-logout:alarm:'.$path;

        if (! Cache::add($key, true, $seconds)) {
            // Already raised within this window — throttled, not silenced:
            // the next window raises again if the outage continues.
            return;
        }

        Log::critical('keycloak.backchannel_logout.invalidation_store_unavailable', array_merge([
            'path' => $path,
            'reason' => $reason,
        ], $context));
    }
}
