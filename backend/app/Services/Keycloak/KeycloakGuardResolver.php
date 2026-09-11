<?php

namespace App\Services\Keycloak;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Backing resolver for the `keycloak` auth guard (stage E1 — the bridge).
 * Wired via `Auth::viaRequest('keycloak', …)` in `AppServiceProvider::boot()`
 * so `auth:sanctum,keycloak` on a business route accepts either token type
 * without either middleware knowing about the other.
 *
 * Deliberately narrow: validates the bearer JWT with the existing
 * `TokenValidator` (signature/issuer/audience/expiry — the identity
 * contract), then resolves the LOCAL user by `keycloak_sub` — never by
 * e-mail. `users.role` stays the only source of business roles; this class
 * never reads `realm_access.roles` for anything but existing (discarding it
 * immediately) — the disagreement guarantee (§3) lives here: a token can
 * carry any realm role, only the local row's `role` column reaches
 * `EnsureRole`.
 */
class KeycloakGuardResolver
{
    /** Any user we did touch `last_login_at` for keeps that value for this long. */
    private const LAST_LOGIN_THROTTLE_HOURS = 24;

    public function __construct(private readonly TokenValidator $validator) {}

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

        $user = User::query()->where('keycloak_sub', $principal->sub)->first();

        if ($user === null) {
            return null;
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
