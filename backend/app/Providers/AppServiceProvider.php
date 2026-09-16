<?php

namespace App\Providers;

use App\Http\Middleware\AuthenticateKeycloakToken;
use App\Services\Keycloak\KeycloakGuardResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Route-middleware alias for the Keycloak-token guard. It is registered
        // here rather than referenced by class name in the route, because
        // PublicRoutesSmokeTest recognises a route as protected only by an
        // "auth.*" alias string in gatherMiddleware() — a fully qualified class
        // name does not satisfy that check (str_starts_with($middleware, 'auth')).
        $this->app['router']->aliasMiddleware('auth.keycloak', AuthenticateKeycloakToken::class);

        // Named guard `keycloak` (SSO-only): resolves a LOCAL `User` from a
        // Keycloak bearer token via `keycloak_sub`, so `auth:keycloak` on a
        // business route accepts a Konta Niepodzielni token. See
        // `KeycloakGuardResolver` for the actual rules (blocked / deleted /
        // anonymised / unbound / back-channel-invalidated all resolve to
        // null → 401).
        Auth::viaRequest('keycloak', function (Request $request) {
            return $this->app->make(KeycloakGuardResolver::class)->resolve($request);
        });
    }
}
