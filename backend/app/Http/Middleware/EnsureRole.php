<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Role gate: `role:project_manager,super_admin`. Alias: `role`.
 */
class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if ($user === null || ! in_array($user->role, $roles, true)) {
            throw new ApiException(403, 'forbidden', 'Nie masz dostępu do tej sekcji.');
        }

        return $next($request);
    }
}
