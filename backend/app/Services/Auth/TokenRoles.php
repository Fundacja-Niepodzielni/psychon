<?php

namespace App\Services\Auth;

use App\Models\User;
use App\Services\Keycloak\KeycloakPrincipal;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * The single place every authorisation call site in this application asks
 * "does the current request's access token carry this role" — R2 (sprint-2
 * §1): "roles read from the access token only". Never `users.role`.
 *
 * Reads the `KeycloakPrincipal` that `KeycloakGuardResolver` (the `keycloak`
 * guard behind every `auth:keycloak` route) attaches to the request once the
 * bearer token validates. A request with no principal attached — never
 * authenticated through that guard — carries no roles, which is exactly
 * right: `EnsureRole` and every `FormRequest::authorize()` using this class
 * fail closed (403/401 via the normal "no user" path), never open.
 *
 * A user may hold several roles at once; every caller here decides by
 * membership (`has()`), never by comparing a single value.
 */
final class TokenRoles
{
    /**
     * Test-only escape hatch — inert outside `APP_ENV=testing` and unless a
     * test explicitly binds it. The pre-existing feature-test suite
     * authenticates hundreds of tests via `$this->actingAs($user,
     * 'keycloak')` (`Illuminate\Foundation\Testing\Concerns\InteractsWithAuthentication::be()`),
     * which sets the guard's resolved user directly and therefore never
     * runs `KeycloakGuardResolver::resolve()` — there is no real bearer
     * token and no `keycloak_principal` request attribute to read.
     * `Tests\TestCase::actingAs()` binds the acting user's LOCAL role here,
     * as a stand-in for "the token this user would have carried", so that
     * suite keeps working without rewriting every one of those tests to
     * mint a real JWT. `current()` only ever falls back to this when NO
     * real principal is attached to the request — a test that sends an
     * actual bearer token (every SSO/disagreement test does) is governed
     * by that token alone, exactly like production.
     */
    public const TESTING_FALLBACK_ROLES = 'testing.keycloak_acting_as_roles';

    public function __construct(private readonly Request $request) {}

    /**
     * Local PsychON role names granted by the current request's token,
     * already filtered through the whitelist (`config('keycloak.roles')`).
     * An empty list is a valid state — it is NOT the same as "unauthenticated"
     * and must never be treated as an error by a caller.
     *
     * @return list<string>
     */
    public function current(): array
    {
        $principal = $this->request->attributes->get('keycloak_principal');

        if ($principal instanceof KeycloakPrincipal) {
            return $principal->authorizingRoles();
        }

        if (app()->environment('testing') && app()->bound(self::TESTING_FALLBACK_ROLES)) {
            return app(self::TESTING_FALLBACK_ROLES);
        }

        return [];
    }

    /**
     * True when the current token grants at least one of the given local
     * role names. A user may hold several roles — this is a membership
     * check, never a single-value comparison.
     */
    public function has(string ...$localRoles): bool
    {
        return array_intersect($localRoles, $this->current()) !== [];
    }

    /**
     * The role name an account's own `/me` should report — measured
     * disagreement: `users.role=volunteer` + token `pacjent` let the gate
     * through while `EnsureRole` refused the data behind it. Derived from
     * the SAME source `EnsureRole`/`has()` decide access with — never
     * `users.role` — so a client gating on this field agrees with what a
     * protected route actually does for this token.
     *
     * Only substitutes the token-derived value for a SELF view: `$user` is
     * the current request's own resolved local user (`$this->request
     * ->user()->is($user)`) AND a real bearer token backs it. A resource
     * describing someone ELSE's account (the H18 person card, an admin
     * extending someone else's access) has no other person's token on this
     * request to derive from and keeps reporting `users.role`, unchanged.
     *
     * When the token authorises more than one local role, the
     * highest-privilege one wins (whitelist order, `config('keycloak
     * .roles')`); `null` when it authorises none — never a role the token
     * itself would be refused for.
     *
     * Logs `auth.role_column_mismatch` (account id only — no token value,
     * no personal data) the moment `users.role` disagrees with this value
     * on a real token principal, so the disagreement stops being silent.
     */
    public function effectiveRoleFor(User $user): ?string
    {
        $principal = $this->request->attributes->get('keycloak_principal');

        if (! $principal instanceof KeycloakPrincipal || ! $this->request->user()?->is($user)) {
            return $user->role;
        }

        $derived = $this->current()[0] ?? null;

        if ($derived !== $user->role) {
            Log::warning('auth.role_column_mismatch', ['user_id' => $user->id]);
        }

        return $derived;
    }
}
