<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use App\Services\Keycloak\InvalidKeycloakTokenException;
use App\Services\Keycloak\KeycloakBackchannelInvalidation;
use App\Services\Keycloak\TokenValidator;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

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
        private readonly KeycloakBackchannelInvalidation $backchannel,
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
        // — `check()` returns `null` for those straight away.
        $cause = $this->backchannel->check($principal->sid, $principal->sub);

        if ($cause !== null) {
            throw new ApiException(
                401,
                'invalid_token',
                'Token dostępu jest nieprawidłowy lub wygasł.',
                reason: ['cause' => $cause],
            );
        }

        $request->attributes->set('keycloak_principal', $principal);

        return $next($request);
    }
}
