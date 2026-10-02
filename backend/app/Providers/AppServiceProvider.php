<?php

namespace App\Providers;

use App\Http\Middleware\AuthenticateKeycloakToken;
use App\Services\Keycloak\KeycloakGuardResolver;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /** Nazwa limitu w `throttle:` na trasach zlecenia wgrania nagrania lekcji. */
    public const string RECORDING_UPLOADS_LIMITER = 'recording-uploads';

    public const int RECORDING_UPLOADS_PER_MINUTE = 10;

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

        // Zlecenie wgrania nagrania lekcji (`POST …/video-uploads`, trasa administracji
        // i trasa prowadzącego) wysyła żądanie do dostawcy nagrań, więc ma limit żądań:
        // 10 na minutę na osobę, jedna definicja dla obu tras. Limit jest NAZWANY
        // i ma własny klucz — nienazwany `throttle:N,M` liczy po samej osobie, więc
        // dzieliłby licznik z każdym innym nienazwanym limitem tej samej osoby.
        // Przekroczenie = 429 `too_many_requests` ze wspólnej koperty błędu
        // (`ApiExceptionRenderer`, `reason.retry_after_seconds`).
        RateLimiter::for(self::RECORDING_UPLOADS_LIMITER, static function (Request $request): Limit {
            $person = $request->user()?->getAuthIdentifier() ?? $request->ip();

            return Limit::perMinute(self::RECORDING_UPLOADS_PER_MINUTE)
                ->by(self::RECORDING_UPLOADS_LIMITER.':'.$person);
        });
    }
}
