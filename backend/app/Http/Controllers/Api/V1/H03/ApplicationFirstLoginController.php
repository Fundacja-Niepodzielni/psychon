<?php

namespace App\Http\Controllers\Api\V1\H03;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Services\H03\ApplicationFirstLoginBinder;
use App\Services\Keycloak\KeycloakPrincipal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * POST /api/v1/applications/first-login — pierwsze logowanie osoby
 * z przyjętego zgłoszenia. Chroniony middlewarem `auth.keycloak` (konto
 * lokalne nie ma jeszcze `sub`, więc strażnik `keycloak` by go nie znalazł).
 * Warunki wiązania opisuje {@see ApplicationFirstLoginBinder}.
 */
class ApplicationFirstLoginController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        /** @var KeycloakPrincipal $principal */
        $principal = $request->attributes->get('keycloak_principal');

        $user = ApplicationFirstLoginBinder::bind($principal, (string) $request->bearerToken());

        return response()->json([
            'data' => UserResource::make($user)->resolve($request),
        ]);
    }
}
