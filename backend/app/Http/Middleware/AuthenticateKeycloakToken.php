<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use App\Services\Keycloak\BackchannelLogoutAlarm;
use App\Services\Keycloak\InvalidationStore;
use App\Services\Keycloak\InvalidKeycloakTokenException;
use App\Services\Keycloak\KeycloakSessionRegistry;
use App\Services\Keycloak\TokenValidator;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * Registered as the `auth.keycloak` alias in
 * `App\Providers\AppServiceProvider::boot()` (see that route file's header
 * comment for why — `bootstrap/app.php` is outside this role's scope).
 *
 * Validates the bearer token (slice 1) and, when it carries a `sid`, is
 * also the back-channel logout READ PATH (slice 3, contract §4.5a /
 * consumer note points 6 and 7): it consults the invalidation-marker store
 * before letting the request through, because a resource server that only
 * validates the JWT's own signature/expiry would keep accepting a token for
 * a session Konta Niepodzielni already ended — the boundary the identity
 * contract §2c.5(B) calls out explicitly ("a bearer token bypasses the IdP
 * session by design"). Consulting the marker on every request is what
 * closes exactly that gap for the one route this middleware guards.
 */
class AuthenticateKeycloakToken
{
    public function __construct(
        private readonly TokenValidator $validator,
        private readonly InvalidationStore $markers,
        private readonly KeycloakSessionRegistry $sessions,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $header = $request->header('Authorization', '');
        $token = null;
        if (is_string($header) && str_starts_with($header, 'Bearer ')) {
            $token = substr($header, 7);
        }

        try {
            $principal = $this->validator->validate($token);
        } catch (InvalidKeycloakTokenException $e) {
            throw new ApiException(
                401,
                'invalid_token',
                'Token dostępu jest nieprawidłowy lub wygasł.',
                reason: ['cause' => $e->reason],
            );
        }

        // Tokens with no `sid` never went through a browser session Konta
        // Niepodzielni can back-channel-log-out (e.g. `client_credentials`)
        // — there is nothing to check, and this is the identical branch
        // every existing hermetic token test exercises (none of those
        // tokens carry a `sid`), so this slice adds zero store calls to
        // that path.
        if ($principal->sid !== null) {
            $verdict = $this->markers->verdict($principal->sid);

            if ($verdict['state'] === InvalidationStore::READ_FAILURE) {
                // Point 6: "I cannot read the store" means "not invalidated
                // → refuse, force re-login" — never "no marker → let in".
                BackchannelLogoutAlarm::raise('read', $verdict['reason'], ['sid' => $principal->sid]);

                // Point 7: a refusal caused by OUR OWN storage outage must
                // NOT delete the session-registry row. Once the store
                // heals, the marker decides — not cleanup performed during
                // the outage. So: deny, and touch nothing.
                throw new ApiException(
                    401,
                    'invalid_token',
                    'Token dostępu jest nieprawidłowy lub wygasł.',
                    reason: ['cause' => 'session_check_unavailable'],
                );
            }

            if ($verdict['state'] === InvalidationStore::READ_MARKED) {
                // Confirmed invalidation — now it is safe to clean up the
                // bookkeeping row, because the decision did not come from a
                // storage failure. Wrapped defensively: an unrelated fault in
                // this bookkeeping table must never turn a correct 401 into
                // an uncaught 500 — the deny decision already stands on its
                // own regardless of whether this cleanup succeeds.
                try {
                    $this->sessions->destroy($principal->sid, null);
                } catch (Throwable $e) {
                    Log::warning('keycloak.backchannel_logout.session_cleanup_failed', ['message' => $e->getMessage()]);
                }

                throw new ApiException(
                    401,
                    'invalid_token',
                    'Token dostępu jest nieprawidłowy lub wygasł.',
                    reason: ['cause' => 'session_invalidated'],
                );
            }

            // READ_ABSENT with a HEALTHY store: the positive control half of
            // point 6 — a healthy, empty marker store must still admit
            // everybody, or this fail-safe has shipped a mass logout.
            // Bookkeeping only, wrapped for the same reason as above: it
            // must never turn an otherwise-valid request into a 500.
            try {
                $this->sessions->touch($principal->sid, $principal->sub);
            } catch (Throwable $e) {
                Log::warning('keycloak.backchannel_logout.session_touch_failed', ['message' => $e->getMessage()]);
            }
        }

        $request->attributes->set('keycloak_principal', $principal);

        return $next($request);
    }
}
