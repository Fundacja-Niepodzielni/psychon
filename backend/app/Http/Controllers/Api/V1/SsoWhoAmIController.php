<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Keycloak\KeycloakPrincipal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET /api/v1/sso/whoami — the smallest possible witness that a Keycloak
 * bearer token is accepted (`ZLECENIE-044` §2 item 3). Reads back exactly
 * what the token carries; does not touch the local `users` table (that is
 * the disagreement guarantee: `sub`/`roles` here are the token's, never
 * `users.role`). Not a production endpoint of any package — a verification
 * fixture for this slice, kept small on purpose.
 */
class SsoWhoAmIController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        /** @var KeycloakPrincipal $principal */
        $principal = $request->attributes->get('keycloak_principal');

        return response()->json([
            'sub' => $principal->sub,
            'roles' => $principal->roles,
        ]);
    }
}
