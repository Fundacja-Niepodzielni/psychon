<?php

/*
|--------------------------------------------------------------------------
| Public API routes (no authentication)
|--------------------------------------------------------------------------
| The ONLY routes allowed to skip auth. The authorization smoke test
| (tests/Feature/PublicRoutesSmokeTest) fails when any other /api route
| is reachable without a token. Additions only via the contract guardian.
|
| Patterns match route URIs; `*` is a wildcard (Str::is).
*/

return [
    'api/v1/auth/login',
    'api/v1/auth/forgot-password',
    'api/v1/auth/reset-password',
    'api/v1/auth/activate',
    'api/v1/verify/*', // public certificate verification (H13)
];
