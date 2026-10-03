<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use App\Http\Attributes\AvailableAfterAccessEnds;
use Closure;
use Illuminate\Http\Request;
use ReflectionMethod;
use Symfony\Component\HttpFoundation\Response;

/**
 * Time-boxed access gate (module: dostęp czasowy). Alias: `access.active`.
 *
 * Blocks when access_expires_at has passed and the programme is not
 * completed. Packages attach this middleware to their own content routes —
 * routes that must stay reachable after expiry (profile, certificates)
 * simply do not use it. An action marked `#[AvailableAfterAccessEnds]`
 * (the help form) passes as well.
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
            && ! $this->availableAfterAccessEnds($request)
        ) {
            throw new ApiException(
                403,
                'access_expired',
                'Twój dostęp do materiałów wygasł. Skontaktuj się z opiekunem projektu.',
            );
        }

        return $next($request);
    }

    private function availableAfterAccessEnds(Request $request): bool
    {
        $route = $request->route();
        $controller = $route?->getControllerClass();
        $method = $route?->getActionMethod();

        if ($controller === null || $method === null || ! method_exists($controller, $method)) {
            return false;
        }

        return (new ReflectionMethod($controller, $method))->getAttributes(AvailableAfterAccessEnds::class) !== [];
    }
}
