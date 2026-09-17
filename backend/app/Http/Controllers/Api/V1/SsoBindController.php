<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Services\H03\ApplicationFirstLoginBinder;
use App\Services\Keycloak\KeycloakPrincipal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * POST /api/v1/sso/powiaz — wiązanie `sub` z kontem lokalnym z odnośnika
 * zaproszenia (obok polecenia operatora). Protected by `auth.keycloak`
 * (the principal middleware), never the `keycloak` guard — there is no
 * local user to resolve yet, that is the whole point of this endpoint.
 *
 * Konto wskazuje jednorazowy token zaproszenia (`users.activation_token`),
 * zużywany przy powodzeniu, więc drugie wywołanie tym samym tokenem kończy
 * się 422. Warunki wiązania są te same co przy pierwszym logowaniu
 * (potwierdzony adres, adres równy adresowi zaproszenia, właściwy wystawca;
 * po powiązaniu konto aktywne) i żyją w jednym miejscu:
 * {@see ApplicationFirstLoginBinder}.
 */
class SsoBindController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        /** @var KeycloakPrincipal $principal */
        $principal = $request->attributes->get('keycloak_principal');

        $data = $request->validate([
            'token' => ['required', 'string'],
        ]);

        $user = ApplicationFirstLoginBinder::bindByInvitationToken(
            $principal,
            (string) $request->bearerToken(),
            $data['token'],
        );

        return response()->json([
            'data' => UserResource::make($user)->resolve($request),
        ]);
    }
}
