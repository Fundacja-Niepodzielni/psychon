<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use App\Services\Auth\TokenRoles;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Role gate: `role:project_manager,super_admin`. Alias: `role`.
 *
 * R2 (sprint-2 §1): decides by membership against the ACCESS TOKEN's roles
 * (`TokenRoles`, filtered through the whitelist), never `users.role`. An
 * authenticated user whose token grants none of the whitelisted roles — an
 * empty set is a valid state — gets 403 here, not 401 and not an error.
 */
class EnsureRole
{
    public function __construct(private readonly TokenRoles $tokenRoles) {}

    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if ($user === null || ! $this->tokenRoles->has(...$roles)) {
            throw new ApiException(
                403,
                'forbidden',
                'Nie masz dostępu do tej sekcji.',
                reason: [
                    'required_roles' => $roles,
                    'your_roles' => $this->tokenRoles->current(),
                ],
            );
        }

        return $next($request);
    }
}
