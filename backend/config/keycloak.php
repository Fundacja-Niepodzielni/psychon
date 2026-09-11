<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Keycloak / Konta Niepodzielni — bearer token acceptance
    |--------------------------------------------------------------------------
    |
    | First slice of the SSO work: the API validates access tokens minted by the
    | Konta Niepodzielni realm. It does not (yet) issue sessions, handle the
    | browser login flow, map roles onto the local `users` table, or accept
    | back-channel logout calls — those are later slices.
    |
    | The two-address lesson (the identity contract): a browser and this
    | server never see the IdP at the same address inside Docker. `issuer`
    | is the address a BROWSER would use and the only value ever compared
    | against a token's `iss` claim. `discovery_base` is the address THIS
    | SERVER uses to fetch `/.well-known/openid-configuration` and, from it,
    | the JWKS — normally the same address in dev, but set to an internal
    | compose service name once this server joins the IdP's network.
    |
    */

    'issuer' => env('KEYCLOAK_ISSUER'),

    'discovery_base' => env('KEYCLOAK_DISCOVERY_BASE', env('KEYCLOAK_ISSUER')),

    // Frozen contract value (the identity contract): the only audience this
    // API ever accepts. Never read from the environment — a wrong value here
    // would silently widen who gets in.
    'audience' => 'psychon-api',

    // Seconds the discovery document + JWKS are cached before being re-fetched.
    'jwks_cache_ttl' => (int) env('KEYCLOAK_JWKS_CACHE_TTL', 300),

    // Leeway (seconds) for `exp`/`iat`/`nbf` clock-skew, kept at 0 by default —
    // widen only with a measured reason, never as a blanket workaround.
    'leeway' => (int) env('KEYCLOAK_LEEWAY', 0),

    // Throttle (seconds) between two forced JWKS refreshes caused by an
    // unknown `kid` (criterion §B8e): the first unknown `kid` refetches the
    // JWKS once; a second unknown `kid` inside this window is refused
    // without another HTTP call to the IdP — the identity contract's "1
    // refresh / 60 s" guard against a token-storm forcing repeated fetches.
    'jwks_kid_miss_throttle_seconds' => (int) env('KEYCLOAK_JWKS_KID_MISS_THROTTLE', 60),

    /*
    |--------------------------------------------------------------------------
    | Authorising roles — R2 (sprint-2 §1): roles are read from the access
    | token's `realm_access.roles` ONLY, filtered through this whitelist.
    | `users.role` is never consulted for authorisation (display/report copy
    | only). An empty intersection is a valid state — authentication still
    | succeeds, role-protected resources answer 403, never 401.
    |
    | Local PsychON role name => realm role name (`niepodzielni-konta`
    | realm export, `roles.realm[].name`). Mapped by the collaboration each
    | local role actually performs on PsychON, since the realm role names
    | are the shared ecosystem vocabulary, not PsychON-specific strings:
    |   - super_admin      => admin-fundacja  (foundation ecosystem admin)
    |   - project_manager  => koordynator     (area coordinator)
    |   - instructor       => prowadzacy      (runs classes/groups)
    |   - volunteer        => wolontariusz    (volunteer past the prep path;
    |                                          granted by svc-psychon)
    |   - student           => pacjent         (person using courses/materials)
    | `wymaga-2fa` (a composite marker realm role) and any other realm role
    | (`psycholog`, `redaktor`, …) are deliberately absent — they grant
    | nothing here, whether or not they show up in `realm_access.roles`.
    |--------------------------------------------------------------------------
    */
    'roles' => [
        'super_admin' => env('KEYCLOAK_ROLE_SUPER_ADMIN', 'admin-fundacja'),
        'project_manager' => env('KEYCLOAK_ROLE_PROJECT_MANAGER', 'koordynator'),
        'instructor' => env('KEYCLOAK_ROLE_INSTRUCTOR', 'prowadzacy'),
        'volunteer' => env('KEYCLOAK_ROLE_VOLUNTEER', 'wolontariusz'),
        'student' => env('KEYCLOAK_ROLE_STUDENT', 'pacjent'),
    ],

    /*
    |--------------------------------------------------------------------------
    | TLS
    |--------------------------------------------------------------------------
    | Known limitation of the ephemeral identity provider: the ephemeral IdP has no production-like TLS
    | name, only a local Caddy CA. `ca_file`, when set, is trusted explicitly.
    | `insecure_tls` skips verification entirely and MUST be true only for a
    | local/test run against that throwaway CA — never in production, and
    | never hardcoded true here (recipe §8 gap 5 / criterion §5).
    */
    'ca_file' => env('KEYCLOAK_CA_FILE'),

    'insecure_tls' => (bool) env('KEYCLOAK_INSECURE_TLS', false),

    /*
    |--------------------------------------------------------------------------
    | Back-channel logout (contract §4.5 / §4.5a)
    |--------------------------------------------------------------------------
    */

    // A logout token's `iat` older than this (seconds) is rejected — part of
    // the contract's full validation list ("iat świeże"), independent of
    // the eight consumer-note points this slice is measured against.
    'logout_token_max_age_seconds' => (int) env('KEYCLOAK_LOGOUT_TOKEN_MAX_AGE', 300),

    // Throttling window (seconds) for the consumer-side alarm the read and
    // write paths raise when the invalidation-marker store cannot be used —
    // the one remedy that does not depend on the identity provider's own
    // behaviour (measured: Keycloak neither retries nor logs after a 503).
    'alarm_throttle_seconds' => (int) env('KEYCLOAK_ALARM_THROTTLE_SECONDS', 60),

];
