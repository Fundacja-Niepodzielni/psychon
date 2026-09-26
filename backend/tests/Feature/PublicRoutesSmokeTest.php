<?php

namespace Tests\Feature;

use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

/**
 * Authorization smoke test (CI gate — guide §2): every /api route must
 * require authentication unless its URI is listed in config/public_routes.php.
 */
// Bez cechy bazodanowej runner rownolegly nie przelacza tej klasy na wlasna baze
// procesu (`TestDatabases.php`, `Arr::hasAny($uses, $databaseTraits)`), wiec
// zostaje na bazie WSPOLNEJ i sciga sie z
// sasiadami. Grupa `wspolna-baza` wypada z kroku A bramki i biegnie sekwencyjnie w B.
// Regula pilnowana mechanicznie: `tests/Feature/Przyrzad/GrupaWspolnejBazyTest.php`.
#[Group('wspolna-baza')]
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

    /**
     * SSO only: there is no password auth left to whitelist —
     * `config/public_routes.php` keeps only the two non-auth exceptions
     * (public certificate verification, signed material links). Every
     * `auth/*` password route from the pre-SSO starter is gone; the 404
     * for the deleted password-login route itself is asserted in `PasswordAuthGoneTest`.
     */
    public function test_the_whitelisted_public_routes_exist(): void
    {
        $uris = collect(Route::getRoutes()->getRoutes())
            ->map(fn (RoutingRoute $route): string => $route->uri());

        $this->assertTrue(
            $uris->contains(fn (string $uri): bool => Str::is('api/v1/verify/*', $uri)),
            'Brak trasy api/v1/verify/* (weryfikacja certyfikatów).',
        );

        $this->assertTrue(
            $uris->contains(fn (string $uri): bool => Str::is('api/v1/materials/*/download', $uri)),
            'Brak trasy api/v1/materials/{id}/download.',
        );
    }
}
