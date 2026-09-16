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
    'api/v1/verify/*', // public certificate verification (H13)
    'api/v1/materials/*/download', // temporary signed material link (H05) — authorization by signature, re-checked in the controller
    'api/v1/legal-documents/*/current', // public read of the current legal document version (H22)
    'api/v1/legal-documents/*/versions/*', // public read of a specific legal document version (H22)
];
