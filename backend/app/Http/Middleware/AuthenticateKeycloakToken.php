<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use App\Services\Keycloak\InvalidKeycloakTokenException;
use App\Services\Keycloak\TokenValidator;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Applied by fully-qualified class name in `routes/api/sso.php` (no alias
 * registered — `bootstrap/app.php` is outside this role's scope; see that
 * route file's header comment).
 *
 * First slice of the SSO work: validates the bearer token and makes
 * the resulting `KeycloakPrincipal` available via `$request->attributes`.
 * Does not touch `auth:sanctum`, the session guard, or the `users` table —
 * the existing login path is untouched by design.
 */
class AuthenticateKeycloakToken
{
    public function __construct(private readonly TokenValidator $validator) {}

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

        $request->attributes->set('keycloak_principal', $principal);

        return $next($request);
    }
}
