<?php

namespace App\Services\Keycloak;

/**
 * The identity carried by a validated Keycloak access token — nothing more.
 *
 * `sub` is the ONLY identifier this slice trusts to bind a token to a person
 * (`ZALACZNIK-OD-022` criterion §5: binding by `sub`, never by e-mail). Roles
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
     */
    public function __construct(
        public readonly string $sub,
        public readonly array $roles,
    ) {}

    public function hasRole(string $role): bool
    {
        return in_array($role, $this->roles, true);
    }
}
