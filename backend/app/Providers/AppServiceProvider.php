<?php

namespace App\Providers;

use App\Http\Middleware\AuthenticateKeycloakToken;
use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Notifications\Messages\MailMessage;
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
        // ZLECENIE-044: registers a route-middleware alias for the ephemeral
        // Keycloak-token guard WITHOUT touching bootstrap/app.php, which is
        // outside KOD-DOPIECIA's declared scope (WOLNO covers backend/app/*,
        // and AppServiceProvider is already wired into bootstrap/providers.php
        // unmodified). This keeps routes/api/sso.php's middleware() call a
        // recognizable "auth.*" alias string, which is what
        // Tests\Feature\PublicRoutesSmokeTest inspects via gatherMiddleware()
        // to decide a route requires authentication — an FQCN string does not
        // satisfy that heuristic (str_starts_with($middleware, 'auth')).
        $this->app['router']->aliasMiddleware('auth.keycloak', AuthenticateKeycloakToken::class);

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
