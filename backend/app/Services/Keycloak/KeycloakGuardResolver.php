<?php

namespace App\Services\Keycloak;

use App\Exceptions\AccountNotLinkedException;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Backing resolver for the `keycloak` auth guard — SSO-only, the ONLY guard
 * on every business route (`auth:keycloak`). Wired via
 * `Auth::viaRequest('keycloak', …)` in `AppServiceProvider::boot()`.
 *
 * Validates the bearer JWT with the existing `TokenValidator`
 * (signature/issuer/audience/expiry — the identity contract), applies the
 * SAME back-channel logout READ PATH as `AuthenticateKeycloakToken`
 * (`KeycloakBackchannelInvalidation` — contract §4.5a) so a session Konta
 * Niepodzielni already ended dies on every business route, not only on
 * `/sso/whoami`, then resolves the LOCAL user by `keycloak_sub` — never by
 * e-mail. Roles are the OPPOSITE of `users.role`: R2 (sprint-2 §1) reads
 * authorisation exclusively from the validated token's `realm_access.roles`
 * (see `KeycloakPrincipal::authorizingRoles()` / `App\Services\Auth\TokenRoles`),
 * so this resolver attaches the validated `KeycloakPrincipal` to the request
 * — the disagreement guarantee lives here: a stale/conflicting `users.role`
 * never reaches `EnsureRole`, the token always does.
 */
class KeycloakGuardResolver
{
    /** Any user we did touch `last_login_at` for keeps that value for this long. */
    private const LAST_LOGIN_THROTTLE_HOURS = 24;

    public function __construct(
        private readonly TokenValidator $validator,
        private readonly KeycloakBackchannelInvalidation $backchannel,
    ) {}

    public function resolve(Request $request): ?User
    {
        $token = $this->bearerToken($request);

        if ($token === null) {
            return null;
        }

        try {
            $principal = $this->validator->validate($token);
        } catch (InvalidKeycloakTokenException) {
            return null;
        }

        if ($this->backchannel->check($principal->sid, $principal->sub) !== null) {
            return null;
        }

        // Stashed for `TokenRoles` (app/Services/Auth/TokenRoles.php) — the
        // single place every authorisation call site (EnsureRole, the
        // FormRequest::authorize() methods, …) reads roles from. Every
        // business route resolves its user through THIS guard, not the
        // `auth.keycloak` middleware, so the principal has to be attached
        // here too, not only in `AuthenticateKeycloakToken`.
        $request->attributes->set('keycloak_principal', $principal);

        $user = User::query()->where('keycloak_sub', $principal->sub)->first();

        if ($user === null) {
            // JEDYNE wyjście z tej metody, które nazywa powód odmowy i oddaje
            // pytającemu `sub` z jego własnego tokena — po to, żeby osoba,
            // która właśnie się zalogowała, mogła przepisać ten identyfikator
            // administratorowi. Stoi TUTAJ, a nie wyżej, celowo: w tym miejscu
            // token przeszedł już pełną walidację (podpis, wystawca, odbiorca,
            // ważność) ORAZ sprawdzenie unieważnionej sesji, więc `sub` wraca
            // wyłącznie do posiadacza tokena, któremu ta aplikacja ufa.
            // Pozostałe `return null` w tej metodzie znaczą co innego (brak
            // nagłówka, token nieważny, sesja wylogowana back-channel, konto
            // zablokowane/anonimizowane) i zostają nierozróżnialne.
            // `sub` nie idzie przy tym do żadnego dziennika — patrz
            // `AccountNotLinkedException` (nie jest raportowany).
            throw new AccountNotLinkedException($principal->sub);
        }

        if (in_array($user->status, ['blocked', 'deleted'], true)) {
            return null;
        }

        if ($user->anonymized_at !== null) {
            return null;
        }

        $this->touchLastLogin($user);

        return $user;
    }

    private function bearerToken(Request $request): ?string
    {
        $header = $request->header('Authorization', '');

        if (! str_starts_with($header, 'Bearer ')) {
            return null;
        }

        $token = substr($header, 7);

        return $token === '' ? null : $token;
    }

    /**
     * At most once per 24h per user — a bound account that keeps calling the
     * API all day must not turn into a write on every single request.
     *
     * `Carbon::parse(...)` rather than calling straight into
     * `$user->last_login_at` (Larastan/PHPStan reads the DB column's own
     * type here, a plain string, not the runtime `datetime` cast from
     * `User::casts()` — the same well-known gap already baselined across
     * this codebase for every OTHER date-cast column; parsing explicitly
     * avoids adding one more entry for this one).
     */
    private function touchLastLogin(User $user): void
    {
        $threshold = now()->subHours(self::LAST_LOGIN_THROTTLE_HOURS);
        $lastLoginAt = $user->last_login_at;

        if ($lastLoginAt !== null && Carbon::parse($lastLoginAt)->gt($threshold)) {
            return;
        }

        $user->forceFill(['last_login_at' => now()])->save();
    }
}
