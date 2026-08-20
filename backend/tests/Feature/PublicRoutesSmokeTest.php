<?php

namespace Tests\Feature;

use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Authorization smoke test (CI gate — guide §2): every /api route must
 * require authentication unless its URI is listed in config/public_routes.php.
 */
class PublicRoutesSmokeTest extends TestCase
{
    public function test_every_api_route_requires_auth_unless_whitelisted(): void
    {
        $publicPatterns = config('public_routes');

        $apiRoutes = collect(Route::getRoutes()->getRoutes())
            ->filter(fn (RoutingRoute $route): bool => str_starts_with($route->uri(), 'api/'));

        $this->assertNotEmpty($apiRoutes, 'Brak tras API — nie załadowano routes/api.php.');

        $offenders = [];

        foreach ($apiRoutes as $route) {
            $isPublic = collect($publicPatterns)
                ->contains(fn (string $pattern): bool => Str::is($pattern, $route->uri()));

            if ($isPublic) {
                continue;
            }

            $hasAuth = collect($route->gatherMiddleware())
                ->contains(fn ($middleware): bool => is_string($middleware) && str_starts_with($middleware, 'auth'));

            if (! $hasAuth) {
                $offenders[] = implode('|', $route->methods()).' '.$route->uri();
            }
        }

        $this->assertSame(
            [],
            $offenders,
            "Trasy bez uwierzytelnienia, których nie ma w config/public_routes.php:\n - "
                .implode("\n - ", $offenders),
        );
    }

    public function test_the_whitelisted_auth_routes_exist(): void
    {
        $uris = collect(Route::getRoutes()->getRoutes())
            ->map(fn (RoutingRoute $route): string => $route->uri());

        foreach ([
            'api/v1/auth/login',
            'api/v1/auth/forgot-password',
            'api/v1/auth/reset-password',
            'api/v1/auth/activate',
        ] as $expected) {
            $this->assertTrue($uris->contains($expected), "Brak trasy {$expected}.");
        }
    }
}
