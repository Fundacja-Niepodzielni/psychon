<?php

namespace Tests\Feature;

use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * PsychON is SSO only (Konta Niepodzielni / Keycloak) — the owner's
 * decision: the whole password mechanism is gone, with no transition
 * period. Two independent, mechanical guarantees:
 *
 *   1. the deleted password-login route answers 404, not merely
 *      "unauthenticated" or some other repurposed status;
 *   2. NOT ONE registered route still carries a `sanctum` guard in its
 *      middleware stack — the strongest form of "sanctum is really gone",
 *      because it inspects every route at once instead of a hand-picked
 *      list of the ones this task happened to touch.
 */
class PasswordAuthGoneTest extends TestCase
{
    public function test_post_auth_login_is_gone(): void
    {
        $this->postJson('/api/v1/auth/login', [
            'email' => 'ktos@example.test',
            'password' => 'cokolwiek',
        ])->assertStatus(404);
    }

    public function test_no_route_carries_a_sanctum_guard(): void
    {
        $offenders = collect(Route::getRoutes()->getRoutes())
            ->filter(function (RoutingRoute $route): bool {
                return collect($route->gatherMiddleware())
                    ->contains(fn ($middleware): bool => is_string($middleware) && str_contains($middleware, 'sanctum'));
            })
            ->map(fn (RoutingRoute $route): string => implode('|', $route->methods()).' '.$route->uri())
            ->values()
            ->all();

        $this->assertSame(
            [],
            $offenders,
            "Trasy, które nadal niosą strażnika sanctum:\n - ".implode("\n - ", $offenders),
        );
    }
}
