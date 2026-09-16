<?php

namespace App\Services\Keycloak;

/**
 * The identity carried by a validated Keycloak access token — nothing more.
 *
 * `sub` is the ONLY identifier this slice trusts to bind a token to a person
 * (identity contract: binding by `sub`, never by e-mail). Roles
 * come exclusively from `realm_access.roles` of the access token (criterion
 * §3) — this class has no path back to the local `users` table and must not
 * grow one without a deliberate decision, or the disagreement guarantee this
 * slice proves (token wins over `users.role`) quietly stops being true.
 */
final class KeycloakPrincipal
{
    /**
     * @param  list<string>  $roles  exactly `realm_access.roles` from the
     *                               access token; an empty list is a valid
     *                               state (e.g. `test-kandydat`), not an error.
     * @param  string|null  $sid  the token's `sid` claim, when present — the
     *                            identity the back-channel logout read path
     *                            checks against the invalidation marker
     *                            store. `null` for tokens never bound to a
     *                            browser session (e.g. `client_credentials`).
     */
    public function __construct(
        public readonly string $sub,
        public readonly array $roles,
        public readonly ?string $sid = null,
    ) {}

    public function hasRole(string $role): bool
    {
        return in_array($role, $this->roles, true);
    }

    /**
     * Local PsychON role names granted by this token, i.e. `$this->roles`
     * (raw `realm_access.roles`) filtered through the whitelist in
     * `config('keycloak.roles')` (local name => realm name). This is the
     * ONLY conversion from a realm role to a local one anywhere in this
     * slice (criterion §R2) — a composite marker like `wymaga-2fa`, or any
     * realm role not present in the whitelist, never reaches this list. An
     * empty result is a valid, non-error state.
     *
     * @return list<string>
     */
    public function authorizingRoles(): array
    {
        $whitelist = (array) config('keycloak.roles', []);

        $granted = [];
        foreach ($whitelist as $local => $realm) {
            if (is_string($realm) && $realm !== '' && in_array($realm, $this->roles, true)) {
                $granted[] = (string) $local;
            }
        }

        return $granted;
    }

    /**
     * True when this token grants at least one of the given LOCAL role
     * names (see {@see authorizingRoles()}) — the single membership check
     * every authorisation call site in this application should use instead
     * of comparing against `users.role`.
     */
    public function hasAuthorizingRole(string ...$localRoles): bool
    {
        return array_intersect($localRoles, $this->authorizingRoles()) !== [];
    }
}
