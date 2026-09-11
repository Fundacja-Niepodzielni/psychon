<?php

namespace App\Providers;

use App\Http\Middleware\AuthenticateKeycloakToken;
use App\Models\User;
use App\Services\Keycloak\KeycloakGuardResolver;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Http\Request;
use Illuminate\Notifications\Messages\MailMessage;
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

        // Named guard `keycloak` (stage E1 — the bridge): resolves a LOCAL
        // `User` from a Keycloak bearer token via `keycloak_sub`, so
        // `auth:sanctum,keycloak` on a business route accepts either token
        // type. See `KeycloakGuardResolver` for the actual rules (blocked /
        // deleted / anonymised / unbound all resolve to null → 401).
        Auth::viaRequest('keycloak', function (Request $request) {
            return $this->app->make(KeycloakGuardResolver::class)->resolve($request);
        });

        // Password-reset e-mail: PL content + a link into the frontend.
        ResetPassword::createUrlUsing(function (User $user, string $token): string {
            return self::resetUrl($user, $token);
        });

        ResetPassword::toMailUsing(function (User $notifiable, string $token): MailMessage {
            return (new MailMessage)
                ->subject('Ustaw nowe hasło — Platforma Niepodzielni')
                ->greeting('Cześć '.$notifiable->first_name.'!')
                ->line('Otrzymaliśmy prośbę o zmianę hasła do Twojego konta.')
                ->action('Ustaw nowe hasło', self::resetUrl($notifiable, $token))
                ->line('Link wygasa po 60 minutach. Jeśli to nie Ty — zignoruj tę wiadomość.')
                ->salutation('Zespół Niepodzielni');
        });
    }

    private static function resetUrl(User $user, string $token): string
    {
        return rtrim(config('app.frontend_url'), '/')
            .'/resetowanie-hasla?token='.$token
            .'&email='.urlencode($user->email);
    }
}
