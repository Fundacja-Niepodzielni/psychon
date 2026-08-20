<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Time-boxed access gate (module: dostęp czasowy). Alias: `access.active`.
 *
 * Blocks when access_expires_at has passed and the programme is not
 * completed. Packages attach this middleware to their own content routes —
 * routes that must stay reachable after expiry (profile, certificates)
 * simply do not use it.
 */
class EnsureAccessActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (
            $user !== null
            && $user->program_completed_at === null
            && $user->access_expires_at !== null
            && $user->access_expires_at->isPast()
        ) {
            throw new ApiException(
                403,
                'access_expired',
                'Twój dostęp do materiałów wygasł. Skontaktuj się z opiekunem projektu.',
            );
        }

        return $next($request);
    }
}
