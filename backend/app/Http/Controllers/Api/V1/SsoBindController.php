<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\Keycloak\KeycloakPrincipal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * POST /api/v1/sso/powiaz — the ONLY way a Keycloak `sub` gets attached to a
 * local `users` row (besides the operator command). Protected by
 * `auth.keycloak` (the principal middleware), never the new `keycloak`
 * guard — there is no local user to resolve yet, that is the whole point of
 * this endpoint.
 *
 * Identity contract: binding happens by the one-time invitation token
 * (`users.activation_token`) only — never by e-mail. The token is consumed
 * (cleared) on success, so a second call with the same token always lands
 * in the "unknown or used token" branch below.
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

        $user = User::query()->where('activation_token', $data['token'])->first();

        if ($user === null) {
            throw new ApiException(
                422,
                'invalid_token',
                'Nieprawidłowy lub wykorzystany token zaproszenia.',
            );
        }

        if (in_array($user->status, ['blocked', 'deleted'], true) || $user->anonymized_at !== null) {
            throw new ApiException(
                403,
                'forbidden',
                'To konto nie jest aktywne. Skontaktuj się z opiekunem projektu.',
            );
        }

        if ($user->keycloak_sub !== null && $user->keycloak_sub !== $principal->sub) {
            throw new ApiException(
                409,
                'already_bound',
                'To konto jest już połączone z innym kontem Niepodzielni.',
            );
        }

        $subTakenByAnotherUser = User::query()
            ->where('keycloak_sub', $principal->sub)
            ->where('id', '!=', $user->id)
            ->exists();

        if ($subTakenByAnotherUser) {
            throw new ApiException(
                409,
                'sub_already_bound',
                'To konto Niepodzielni jest już połączone z innym użytkownikiem.',
            );
        }

        $user->forceFill([
            'keycloak_sub' => $principal->sub,
            'activation_token' => null,
        ])->save();

        return response()->json([
            'data' => UserResource::make($user)->resolve($request),
        ]);
    }
}
